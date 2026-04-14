const getMissingItemFields = (items: OrderItem[]): MissingOrderItemFields[] => {
    return items.map(item => {
        return {
            item_id: !(typeof item.item_id === 'string' && item.item_id !== ''),
            sku_id: !(typeof item.sku_id === 'string' && item.sku_id !== ''),
            brand_code: !(typeof item.brand_code === 'string' && item.brand_code !== ''),
            quantity: !(typeof item.quantity === 'number' && item.quantity !== 0),
            price: !(typeof item.price === 'number' && item.price !== 0),
        }
    })
}

export const getMissingFields = (order: Order) => {
    const missingFields: MissingOrderFields = {
        total_items: !(typeof order.total_items === 'number' && order.total_items !== 0),
        order_date: !(typeof order.order_date === 'string' && order.order_date !== ''),
        order_items: getMissingItemFields(order.order_items),
        order_total: !(typeof order.order_total === 'number' && order.order_total !== 0),
        order_tax: !(typeof order.order_tax === 'number' && order.order_tax !== 0),
        order_shipping: !(typeof order.order_shipping === 'number'),
        order_discount: !(typeof order.order_discount === 'number'),
        order_subtotal: !(typeof order.order_subtotal === 'number' && order.order_subtotal !== 0),
    }
    return missingFields
}

export const ORDER_FIELDS = [
	'total_items',
	'is_cancelled',
	'order_status',
	'order_date',
	'order_items',
	'order_total',
	'order_tax',
	'order_shipping',
	'order_discount',
	'order_subtotal',
] as const;

export const ORDER_ITEM_FIELDS = [
	'item_id',
	'sku_id',
	'brand_code',
	'quantity',
	'price',
] as const;

interface MissingOrderItemFields {
    'item_id': boolean
	'sku_id': boolean
	'brand_code': boolean
	'quantity': boolean
	'price': boolean
}

export interface MissingOrderFields {
    total_items: boolean
    order_date: boolean
    order_items: MissingOrderItemFields[]
    order_total: boolean
    order_tax: boolean
    order_shipping: boolean
    order_discount: boolean
    order_subtotal: boolean
}

interface OrderItem {
    item_id?: string
    sku_id?: string
    brand_code?: string
    quantity?: number
    price?: number
    product_name?: string
    product_description?: string
    product_price?: number
    product_image?: string
    product_url?: string
    fulfillment_status?: string
    fulfillment_date?: string
    fulfillment_tracking_number?: string
    fulfillment_tracking_url?: string
    fulfillment_tracking_status?: string
}

export class Order {
    order_id: string = '';
    customer_id: string = '';
    order_completed: boolean = false;
    payment_completed: boolean = false;
    fulfillment_completed: boolean = false;
    enrichment_error?: string;
    fulfillment_error?: string;
    sent_to_fulfillment: boolean = false;
    payment_error?: string;
    enriched: boolean = false;
    is_cancelled: boolean = false;
    cancellation_reason?: string;
    total_cost?: string;
    total_items?: number;
	order_date?: string;
	order_items: OrderItem[] = [] as OrderItem[];
    order_total?: number;
    order_tax?: number;
    order_shipping?: number;
    order_discount?: number;
    order_subtotal?: number;
}