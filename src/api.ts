import 'dotenv/config';

import express, { type Response } from 'express';
import {
    Connection,
    Client,
    WorkflowIdReusePolicy,
    WorkflowIdConflictPolicy,
    isGrpcServiceError,
    WorkflowUpdateFailedError,
    WithStartWorkflowOperation,
  } from '@temporalio/client';
import { status } from '@grpc/grpc-js';
import { WorkflowNotFoundError } from '@temporalio/common';
import { requireAuth, generateToken, getCredentials, appLogger } from './utils';
import { MissingOrderFields, Order } from './types/order';
import { processOrder,
    orderCompletedUpdate,
    queryOrder,
    cancelOrderUpdate,
    paymentReadySignal,
    fulfillmentCompletedUpdate,
} from './workflows';
import { TASK_QUEUE_NAME } from './shared';
import { loadClientConnectConfig } from '@temporalio/envconfig';

const app = express();
app.use(express.json());

let temporalClient: Client;

async function getClient(): Promise<Client> {
  if (!temporalClient) {
    const config = loadClientConnectConfig();
    const connection = await Connection.connect(config.connectionOptions);
    temporalClient = new Client({
      connection,
      namespace: config.namespace ?? 'default',
    });
  }
  return temporalClient;
}

const returnError = (res: Response, error: unknown) => {
    if (error instanceof WorkflowNotFoundError) {
        return formatResponse(res, 404, { error: 'Order not found' });
    }
    if (isGrpcServiceError(error) && error.code === status.NOT_FOUND) {
        return formatResponse(res, 404, { error: error.message || 'Order not found' });
    }
    if (isGrpcServiceError(error)) {
        return formatResponse(res, 502, { error: error.message });
    }
    if (error instanceof WorkflowUpdateFailedError) {
        const detail = error.cause instanceof Error ? error.cause.message : error.message;
        return formatResponse(res, 409, { error: detail });
    }
    const message = error instanceof Error ? error.message : String(error);
    return formatResponse(res, 500, { error: message });
}

/** Temporal workflow id for an order — must match POST /api/v2/order (`order-${order_id}`). */
function toWorkflowId(orderId: string): string {
    return orderId.startsWith('order-') ? orderId : `order-${orderId}`;
}

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

function formatResponse(res: Response, httpStatus: number, payload: Record<string, unknown> | Order | MissingOrderFields ): Response {
  return res.status(httpStatus).json(payload);
}


app.post('/auth', (req, res) => {
    const credentials = getCredentials(req);
    if (!credentials) {
      return formatResponse(res, 400, {
        error: 'Missing credentials. Use Basic auth or JSON body: { username, password }',
      });
    }
  
    const token = generateToken(credentials.username);
    return formatResponse(res, 200, {
      token,
      token_type: 'Bearer',
      expires_in: process.env.JWT_EXPIRY_SECONDS ? `${process.env.JWT_EXPIRY_SECONDS}s` : '24h',
    });
});

// app.use(requireAuth);

app.post('/api/v2/order', async (req, res) => {
    const order = req.body as Order;
    try {
        const client = await getClient();
        const workflowId = `order-${order.order_id}`;

        const result = (await client.workflow.executeUpdateWithStart(orderCompletedUpdate, {
            args: [order],
            startWorkflowOperation: new WithStartWorkflowOperation(processOrder, {
              taskQueue: TASK_QUEUE_NAME,
              args: [order],
              workflowId,
              workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY,
              workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
            }),
          })) as MissingOrderFields | Order;
        if (typeof result.total_items === 'boolean') {
            return formatResponse(res, 202, result);
        }
        return formatResponse(res, 200, result);
    } catch (error) {
        returnError(res, error);
    }
});

app.get('/api/v2/order/:orderId', async (req, res) => {
    const orderId = req.params.orderId;
    const client = await getClient();
    const handle = await client.workflow.getHandle(toWorkflowId(orderId));
    try {
        const result = await handle.query(queryOrder) as Order;
        return formatResponse(res, 200, result);
    } catch (error) {
        returnError(res, error);
    }
});

app.post('/api/v2/order/:orderId/cancel', async (req, res) => {
    const orderId = req.params.orderId;
    const client = await getClient();
    const handle = await client.workflow.getHandle(toWorkflowId(orderId));
    try {
        const cancelled = await handle.executeUpdate(cancelOrderUpdate) as boolean;
        return formatResponse(res, 200, { cancelled });
    } catch (error) {
        returnError(res, error);
    }
});

app.post('/api/v2/order/payment-ready', async (req, res) => {
    const orderId = req.body.orderId as string | undefined;
    if (orderId === undefined || orderId === '') {
        return formatResponse(res, 400, { error: 'JSON body must include a non-empty orderId' });
    }
    const workflowId = toWorkflowId(orderId);
    const startOrder = new Order();
    startOrder.order_id = orderId;

    const client = await getClient();
    try {
        await client.workflow.signalWithStart(processOrder, {
            taskQueue: TASK_QUEUE_NAME,
            args: [startOrder],
            signal: paymentReadySignal,
            workflowId,
            workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY,
            workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
        });

        return formatResponse(res, 200, { success: true });
    } catch (error) {
        returnError(res, error);
    }
});

app.post('/api/v2/order/fulfillment-completed', async (req, res) => {
    const orderId = req.body.orderId as string | undefined;
    if (orderId === undefined || orderId === '') {
        return formatResponse(res, 400, { error: 'JSON body must include a non-empty orderId' });
    }
    const client = await getClient();
    const handle = await client.workflow.getHandle(toWorkflowId(orderId));
    try {
        const fulfillmentCompleted = await handle.executeUpdate(fulfillmentCompletedUpdate) as boolean;
        return formatResponse(res, 200, { fulfillmentCompleted });
    } catch (error) {
        returnError(res, error);
    }
});

const PORT = process.env.PORT ?? 3000;

export { app };

if (process.env.NODE_ENV !== 'test') {
  const portNum = typeof PORT === 'string' ? parseInt(PORT, 10) : PORT;
  const listenPort = Number.isFinite(portNum) ? portNum : 3000;
  app.listen(listenPort, '0.0.0.0', () => {
    appLogger.info('API server listening', { port: listenPort, host: '0.0.0.0' });
  });
}
