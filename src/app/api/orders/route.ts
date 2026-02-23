import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { OrderStatus } from '@prisma/client';

export async function POST(request: Request) {
  try {
    const { userId, vendorId, deliveryAddress, orderItems } = await request.json();

    if (!userId || !vendorId || !deliveryAddress || !orderItems || orderItems.length === 0) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
    }

    // Calculate total amount
    let totalAmount = 0;
    for (const item of orderItems) {
      const product = await prisma.product.findUnique({ where: { id: item.productId } });
      if (!product) {
        return NextResponse.json({ message: `Product with ID ${item.productId} not found` }, { status: 404 });
      }
      totalAmount += product.price * item.quantity;
    }

    const order = await prisma.order.create({
      data: {
        userId,
        vendorId,
        deliveryAddress,
        totalAmount,
        status: OrderStatus.PENDING,
        orderItems: {
          create: orderItems.map((item: { productId: string; quantity: number }) => ({
            productId: item.productId,
            quantity: item.quantity,
            priceAtOrder: item.price, // Assuming price is sent from frontend or fetched again
          })),
        },
      },
      include: { orderItems: true },
    });

    return NextResponse.json({ message: 'Order created successfully', order }, { status: 201 });
  } catch (error) {
    console.error('Error creating order:', error);
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const vendorId = searchParams.get('vendorId');
    const status = searchParams.get('status');

    const where: any = {};
    if (userId) where.userId = userId;
    if (vendorId) where.vendorId = vendorId;
    if (status) where.status = status as OrderStatus;

    const orders = await prisma.order.findMany({
      where,
      include: { user: true, vendor: true, orderItems: { include: { product: true } } },
      orderBy: { orderDate: 'desc' },
    });

    return NextResponse.json({ orders }, { status: 200 });
  } catch (error) {
    console.error('Error fetching orders:', error);
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 });
  }
}
