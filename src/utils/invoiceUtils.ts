import QRCode from 'qrcode';
import pool from '../db';
import { ProductPurchase } from '../models/product';
import { ResultSetHeader, RowDataPacket } from 'mysql2';

export interface MainInvoice {
  id: number;
  purchases: ProductPurchase[];
  totalAmountUSD: number;
  totalAmountZAR: number;
  totalAmountZIG: number;
  performedBy: string;
  status: string;
  qrCodeUrl: string;
  individualReceipts: any[];
}

export async function createMainInvoice(purchases: ProductPurchase[], totalAmountUSD: number, totalAmountZAR: number, totalAmountZIG: number, performedBy: string): Promise<MainInvoice> {
  const totalAmount = totalAmountUSD;
  const query = 'INSERT INTO main_invoices (status, total_amount_usd, total_amount_zar, total_amount_zig, performed_by, total_amount, exit_status) VALUES (?, ?, ?, ?, ?, ?, ?)';
  const values = ['generated', totalAmountUSD, totalAmountZAR, totalAmountZIG, performedBy, totalAmount, 0]; // Set exit_status to 0
  const [result] = await pool.execute<ResultSetHeader>(query, values);

  if (result.insertId) {
    const mainInvoiceId = result.insertId;

    for (const purchase of purchases) {
      await pool.execute('INSERT INTO invoice_purchases (invoice_id, purchase_id) VALUES (?, ?)', [mainInvoiceId, purchase.id]);
    }

    const qrCodeUrl = await QRCode.toDataURL(`Invoice ID: ${mainInvoiceId} Exit: 0`);

    return {
      id: mainInvoiceId,
      purchases,
      totalAmountUSD,
      totalAmountZAR,
      totalAmountZIG,
      performedBy,
      status: 'generated',
      qrCodeUrl,
      individualReceipts: [] // Remove individual receipts from the return
    };
  } else {
    throw new Error('Insert failed');
  }
}


