import { proxyActivities, defineSignal, defineUpdate, defineQuery, setHandler, condition, log } from '@temporalio/workflow';
import { ApplicationFailure, ActivityFailure } from '@temporalio/workflow';
import * as activities from './activities';

import type { Order, MissingOrderFields } from './types/order';
import { getMissingFields } from './types/order';

const PAYMENT_READY_TIMEOUT = 30 * 24 * 60 * 60 * 1000; // 30 days
const FULFILLMENT_COMPLETED_TIMEOUT = 14 * 24 * 60 * 60 * 1000; // 14 days

export const orderCompletedUpdate = defineUpdate<MissingOrderFields | Order, [order: Order]>('orderComplete');
export const paymentReadySignal = defineSignal('paymentReady');
export const cancelOrderUpdate = defineUpdate<boolean>('cancelOrder');
export const fulfillmentCompletedUpdate = defineUpdate<boolean>('fulfillmentCompleted');
export const queryOrder = defineQuery<Order>('queryOrder');

const { enrichOrder, sendToFulfillment, updateMissingOrderCorrectionApi, sendToOrderCorrectionApi } = proxyActivities<typeof activities>({
  startToCloseTimeout: '2 days',
  retry: {
    initialInterval: '10 seconds',
    backoffCoefficient: 2,
    maximumInterval: '1 minute',
    nonRetryableErrorTypes: [],
  },
});

const { reversePayment } = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 seconds',
  retry: {
    initialInterval: '10 seconds',
    backoffCoefficient: 2,
    maximumInterval: '1 minute',
    nonRetryableErrorTypes: ['PaymentNotReversableError'],
  },
});

const hasMissingFields = (fields: MissingOrderFields) => {
  for (const order_item of fields.order_items) {
    if (Object.values(order_item).some((field) => field === true)) {
      return true;
    }
  }
  return Object.values(fields).some((field) => field === true);
}

export async function processOrder(initialOrder: Order): Promise<Order> {
  const workflow = { order: initialOrder };

  setHandler(orderCompletedUpdate, (incoming: Order): MissingOrderFields | Order => {
    log.info('Order completed', { order_id: incoming.order_id });
    const missingFields = getMissingFields(incoming);
    if (hasMissingFields(missingFields)) {
      log.warn('Order completed with missing fields', {
        order_id: incoming.order_id,
        missingFields,
      });

      // Is using an activity inside a signal handler an anti pattern?
      updateMissingOrderCorrectionApi(missingFields);
      return missingFields;
    }
    Object.assign(workflow.order, incoming);
    workflow.order.order_completed = true;
    return workflow.order;
  });
  setHandler(paymentReadySignal, () => {
    log.info('Payment ready', { order_id: workflow.order.order_id });
    workflow.order.payment_completed = true;
  });
  setHandler(cancelOrderUpdate, (): boolean => {
    if (workflow.order.payment_completed) {
      log.info('Payment completed unable to cancel', { order_id: workflow.order.order_id });
      return false;
    } else {
      log.info('Cancelling order', { order_id: workflow.order.order_id });
      workflow.order.is_cancelled = true;

      return true;
    }
  });
  setHandler(fulfillmentCompletedUpdate, () => {
    workflow.order.fulfillment_completed = true;
    return true;
  });
  setHandler(queryOrder, (): Order => workflow.order);

  const paymentReadyResult = await condition(
    () => workflow.order.payment_completed && !workflow.order.is_cancelled,
    PAYMENT_READY_TIMEOUT,
  );
  if (!paymentReadyResult) {

    workflow.order.cancellation_reason = workflow.order.is_cancelled
      ? 'Cancelled by user'
      : 'Payment ready timeout';
    workflow.order.is_cancelled = true;
    return workflow.order;
  }

  await condition(() => workflow.order.order_completed);
  try {
    if (!workflow.order.enriched) {
      await enrichOrder(workflow.order);
      workflow.order.enriched = true;
    }
  } catch (error) {
    log.error('Error enriching order', { error });
      workflow.order.enrichment_error = 'Failed to enrich order';
      throw new Error('Failed to enrich order');
    }
  try {
    if (!workflow.order.sent_to_fulfillment) {
      await sendToFulfillment(workflow.order);
      workflow.order.sent_to_fulfillment = true;
    }
    const fulfillmentCompletedResult = await condition(
      () => workflow.order.fulfillment_completed,
      FULFILLMENT_COMPLETED_TIMEOUT,
    );
    if (!fulfillmentCompletedResult) {
      try {
        await reversePayment(workflow.order);
      } catch (error) {
        if (error instanceof ApplicationFailure && error.name === 'PaymentNotReversableError') {
          workflow.order.payment_error = 'Payment not reversable';
          sendToOrderCorrectionApi(workflow.order);
          log.error('Payment not reversable', { error });
          throw new Error('Payment not reversable');
        }
      }

      workflow.order.fulfillment_error = 'Fulfillment completed timeout';
      throw new Error('Fulfillment completed timeout');
    }
  } catch (error) {
    log.error('Error sending order to fulfillment', { error });
    workflow.order.fulfillment_error = 'Failed to send order to fulfillment';
    throw new Error('Failed to send order to fulfillment');
  }
  return workflow.order;
}
