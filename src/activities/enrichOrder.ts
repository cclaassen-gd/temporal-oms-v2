import { nanoid } from 'nanoid';
import { Order } from '../types/order';

const brandCodes = ['ACME', 'GLOBEX', 'INITECH', 'UMBRELLA', 'STARK'] as const;
const fulfillmentStatuses = ['pending', 'processing', 'shipped', 'delivered'] as const;
const trackingStatuses = ['label_created', 'in_transit', 'out_for_delivery', 'delivered'] as const;
const productAdjectives = ['Premium', 'Deluxe', 'Standard', 'Compact', 'Pro'];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T extends readonly string[]>(arr: T): T[number] {
  return arr[randomInt(0, arr.length - 1)]!;
}

function mockOrderItemFields() {
  const quantity = randomInt(1, 12);
  const unitPrice = Math.round((5 + Math.random() * 250) * 100) / 100;
  const lineTotal = Math.round(quantity * unitPrice * 100) / 100;
  const id = nanoid(8);

  return {
    item_id: `line_${nanoid(10)}`,
    sku_id: `SKU-${nanoid(12).toUpperCase()}`,
    brand_code: pick(brandCodes),
    quantity,
    price: lineTotal,
    product_name: `${pick(productAdjectives)} Item ${randomInt(1000, 9999)}`,
    product_description: `Mock SKU ${id}: synthetic catalog copy for workflow testing.`,
    product_price: unitPrice,
    product_image: `https://picsum.photos/seed/${id}/256/256`,
    product_url: `https://example.com/products/${id}`,
    fulfillment_status: pick(fulfillmentStatuses),
    fulfillment_date: new Date(Date.now() - randomInt(0, 14) * 86_400_000).toISOString(),
    fulfillment_tracking_number: `1Z${nanoid(14).toUpperCase()}`,
    fulfillment_tracking_url: `https://track.example.com/${nanoid(12)}`,
    fulfillment_tracking_status: pick(trackingStatuses),
  };
}

export async function enrichOrder(order: Order): Promise<Order> {
  order.order_items = order.order_items.map((item) => ({
    ...item,
    ...mockOrderItemFields(),
  }));
  return order;
}
