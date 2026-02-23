import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { name, description, price, imageUrl, categoryId, vendorId } = await request.json();

    if (!name || !price || !vendorId) {
      return NextResponse.json({ message: 'Name, price, and vendorId are required' }, { status: 400 });
    }

    const product = await prisma.product.create({
      data: {
        name,
        description,
        price,
        imageUrl,
        categoryId,
        vendorId,
      },
    });

    return NextResponse.json({ message: 'Product created successfully', product }, { status: 201 });
  } catch (error) {
    console.error('Error creating product:', error);
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 });
  }
}
