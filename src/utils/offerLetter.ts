import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

export type OfferLetterData = {
  referenceNumber: string;
  studentNumber: string;
  title?: string | null;
  firstNames?: string | null;
  surname?: string | null;
  programmeName?: string | null;
  programmeDuration?: string | null;
  programmeStartDate?: string | null;
  programmeEndDate?: string | null;
  programmeFee?: string | number | null;
  downPayment?: string | number | null;
  yearOfCommencement?: string | null;
  satelliteCampus?: string | null;
  postalAddress?: string | null;
  residentialAddress?: string | null;
  signatureName?: string | null;
  signatureTitle?: string | null;
  signatureFilePath?: string | null;
  logoFilePath?: string | null;
};

const ensureDir = (dir: string) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const fmtMoney = (value: string | number | null | undefined) => {
  if (value == null || value === '') return 'N/A';
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num)) return String(value);
  return num.toFixed(2);
};

export const generateOfferLetter = async (data: OfferLetterData) => {
  const outputDir = path.join(process.cwd(), 'uploads', 'offer-letters');
  ensureDir(outputDir);

  const fileName = `${data.referenceNumber}-${data.studentNumber}.pdf`;
  const filePath = path.join(outputDir, fileName);
  const publicPath = `/uploads/offer-letters/${fileName}`;

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const stream = fs.createWriteStream(filePath);

  const fullName = `${data.title ? data.title + ' ' : ''}${data.firstNames ?? ''} ${data.surname ?? ''}`.trim();
  const programmeName = data.programmeName ?? 'the programme';
  const year = data.yearOfCommencement ?? new Date().getFullYear().toString();
  const today = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const downPayment = data.downPayment ?? 250;

  const templatePath = path.join(process.cwd(), 'src', 'templates', 'offer-letter.txt');
  let bodyTemplate = '';
  if (fs.existsSync(templatePath)) {
    bodyTemplate = fs.readFileSync(templatePath, 'utf8');
  }

  const bodyText = (bodyTemplate || '')
    .replace(/{{fullName}}/g, fullName || 'Applicant')
    .replace(/{{programmeName}}/g, programmeName)
    .replace(/{{programmeDuration}}/g, data.programmeDuration ?? '')
    .replace(/{{programmeStartDate}}/g, data.programmeStartDate ?? 'TBA')
    .replace(/{{programmeEndDate}}/g, data.programmeEndDate ?? 'TBA')
    .replace(/{{programmeFee}}/g, fmtMoney(data.programmeFee))
    .replace(/{{downPayment}}/g, fmtMoney(downPayment))
    .replace(/{{yearOfCommencement}}/g, year)
    .replace(/{{studentNumber}}/g, data.studentNumber);

  const lineGap = 6;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc.pipe(stream);

  // Header with logo (right) and address (left)
  doc.font('Times-Bold').fontSize(16).text("WOMEN'S UNIVERSITY", { align: 'left' });
  doc.fontSize(16).text('IN AFRICA', { align: 'left' });

  if (data.logoFilePath && fs.existsSync(data.logoFilePath)) {
    doc.image(data.logoFilePath, doc.page.width - doc.page.margins.right - 120, 40, { width: 110 });
  }

  doc.moveDown(0.5);
  doc.font('Times-Roman').fontSize(10);
  doc.text('549 Arcturus Road', { align: 'left' });
  doc.text('Manressa', { align: 'left' });
  doc.text('Harare, Zimbabwe', { align: 'right' });
  doc.text('Tel. 263-4-2459601/08688002924', { align: 'right' });
  doc.moveDown(0.5);
  doc.text('Addressing gender disparity and fostering equity in University Education', { align: 'left' });

  doc.moveDown(1.2);
  doc.fontSize(11).text(today, { align: 'left' });

  doc.moveDown(1);
  doc.font('Times-Roman').fontSize(12);
  doc.text(`Dear ${fullName || 'Applicant'}`, { align: 'left' });

  doc.moveDown(0.8);
  doc.font('Times-Bold').text(`RE: PROVISIONAL ADMISSION INTO THE ${programmeName.toUpperCase()} ACADEMIC YEAR ${year}`);

  if (bodyText) {
    doc.moveDown(0.8);
    doc.font('Times-Roman');

    const marker = '{{COURSES_TABLE}}';
    if (bodyText.includes(marker)) {
      const [before, after] = bodyText.split(marker);
      if (before.trim()) doc.text(before.trim(), { width: pageWidth, lineGap });

      doc.moveDown(0.8);
      doc.font('Times-Bold').text('Courses on offer 2026');
      doc.moveDown(0.4);

      const tableX = doc.x;
      const colGap = 10;
      const colWidth = (pageWidth - colGap * 2) / 3;
      const rowHeight = 14;

      const headers = [
        'Faculty of Management and Entrepreneurial Sciences',
        'Faculty of Agricultural Environmental and Health Sciences',
        'Faculty of Social and Gender Transformative Sciences',
      ];

      const rows = [
        ['Certificate in Cake Making (CCM)', 'Certificate in Basic Life Support (CBLS)', 'Certificate in Social Media Content Creation (CSMCC)'],
        ['Certificate of Food and Beverage Service (CFBS)', 'Certificate in Livestock feed formulation and Animal Nutrition (CLFFAN)', 'Certificate in Interior Décor (CID)'],
        ['Executive Certificate in Labour Law, Conciliation and Arbitration in Zimbabwe (CLLCAZ)', 'Certificate in Commercial Fruit Production (CCFP)', 'Certificate in Garment production (CDP)'],
        ['Professional Certificate in Customer Experience Management (CCEM)', 'Certificate in Agribusiness value chain management and value addition (CAVCM)', 'Certificate in Cosmetology (CC)'],
        ['Digital Marketing for the 4th Industrial Revolution (CDMIR)', 'Certificate in Commercial Goat and Sheep Production (CCGSP)', 'Certificate in Electronic Repairs (CER)'],
      ];

      // Header row
      doc.font('Times-Bold').fontSize(9);
      headers.forEach((h, i) => {
        doc.text(h, tableX + i * (colWidth + colGap), doc.y, { width: colWidth });
      });
      doc.moveDown(1.2);

      // Rows
      doc.font('Times-Roman').fontSize(9);
      rows.forEach((r) => {
        const y = doc.y;
        r.forEach((cell, i) => {
          doc.text(cell, tableX + i * (colWidth + colGap), y, { width: colWidth });
        });
        doc.moveDown(1.2);
      });

      doc.fontSize(12);
      if (after && after.trim()) {
        doc.moveDown(0.6);
        doc.text(after.trim(), { width: pageWidth, lineGap });
      }
    } else {
      doc.text(bodyText, { width: pageWidth, lineGap });
    }
  }

  doc.moveDown(1.2);
  doc.font('Times-Bold').text(data.signatureName ?? 'M. Chirongoma – Munyoro (Mrs)');
  doc.font('Times-Roman').text(data.signatureTitle ?? 'Deputy Registrar (Academic Affairs)');

  if (data.signatureFilePath && fs.existsSync(data.signatureFilePath)) {
    doc.moveDown(0.4);
    doc.image(data.signatureFilePath, doc.x, doc.y, { width: 120 });
  }

  doc.moveDown(1);
  doc.text('I accept / do not accept this offer:');
  doc.moveDown(0.6);
  doc.text('Signature: ________________________________');
  doc.moveDown(0.6);
  doc.text('Date: ________________________________');

  doc.end();

  await new Promise<void>((resolve, reject) => {
    stream.on('finish', () => resolve());
    stream.on('error', (err) => reject(err));
  });

  return { filePath, publicPath, fileName };
};
