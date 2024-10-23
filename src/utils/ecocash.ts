// utils/ecocash.ts
export async function mockEcocashApi(invoiceId: number, phoneNumber?: string): Promise<{ status: string }> {
  // Simulate an API call delay
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Mock response
  return { status: 'success' }; // or 'failed'
}
