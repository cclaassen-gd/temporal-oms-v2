import { Order } from '../types/order';
import { ApplicationFailure } from '@temporalio/activity';

export async function reversePayment(
    order: Order,
    throwError: boolean = false,
  ): Promise<boolean> {
    // Dummy code to reverse payment
    if (throwError) {
        throw new ApplicationFailure('Payment not reversable', 'PaymentNotReversableError');
    }
    return true;
}
