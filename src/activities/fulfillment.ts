import { Order } from '../types/order';
import { nanoid } from 'nanoid';

export async function sendToFulfillment(order: Order): Promise<Order> {
    order.fulfillment_completed = true;
    for (const item of order.order_items) {
        item.fulfillment_date = new Date().toISOString();
        item.fulfillment_tracking_number = `1Z${nanoid(14).toUpperCase()}`;
        item.fulfillment_tracking_url = `https://track.example.com/${nanoid(12)}`;
        item.fulfillment_tracking_status = 'pending';
    }
    return order;
}
