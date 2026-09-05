import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const products = [
  {
    name: 'Stainless Steel Hex Bolt M8x50',
    sku: 'HW-BLT-SS-M8-50',
    category: 'Fasteners',
    brand: 'Apex Fasteners',
    quantity: 500,
    purchasePrice: 4.50,
    sellingPrice: 8.00,
    wholesalePrice: 6.00,
    gstRate: 18,
    hsnCode: '7318',
    minimumStock: 100,
    supplierName: 'Apex Industrial Supplies',
  },
  {
    name: 'Brass Ball Valve 1/2 Inch Heavy Duty',
    sku: 'HW-VALV-BRS-050',
    category: 'Plumbing',
    brand: 'FlowTech',
    quantity: 60,
    purchasePrice: 180.00,
    sellingPrice: 280.00,
    wholesalePrice: 230.00,
    gstRate: 18,
    hsnCode: '8481',
    minimumStock: 15,
    supplierName: 'FlowTech Hardware Traders',
  },
  {
    name: 'PVC Conduit Pipe 25mm 3 Meter',
    sku: 'HW-PVC-CND-25MM',
    category: 'Electrical',
    brand: 'PolyPlast',
    quantity: 120,
    purchasePrice: 65.00,
    sellingPrice: 110.00,
    wholesalePrice: 85.00,
    gstRate: 18,
    hsnCode: '3917',
    minimumStock: 30,
    supplierName: 'PolyPlast Polymers',
  },
  {
    name: 'Masonry Drill Bit Set 5pcs (4-10mm)',
    sku: 'HW-DRL-MAS-5PC',
    category: 'Power Tools',
    brand: 'Bosch Pro',
    quantity: 45,
    purchasePrice: 220.00,
    sellingPrice: 380.00,
    wholesalePrice: 310.00,
    gstRate: 18,
    hsnCode: '8207',
    minimumStock: 10,
    supplierName: 'National Tool Agency',
  },
  {
    name: 'Claw Hammer with Fiberglass Handle 500g',
    sku: 'HW-HAM-CLW-500',
    category: 'Hand Tools',
    brand: 'Stanley Works',
    quantity: 25,
    purchasePrice: 240.00,
    sellingPrice: 420.00,
    wholesalePrice: 340.00,
    gstRate: 18,
    hsnCode: '8205',
    minimumStock: 8,
    supplierName: 'National Tool Agency',
  },
  {
    name: 'Steel Measuring Tape 5 Meter',
    sku: 'HW-TAP-STL-5M',
    category: 'Measuring Tools',
    brand: 'Freemans',
    quantity: 80,
    purchasePrice: 85.00,
    sellingPrice: 160.00,
    wholesalePrice: 125.00,
    gstRate: 18,
    hsnCode: '9017',
    minimumStock: 20,
    supplierName: 'National Tool Agency',
  },
  {
    name: 'Silicone Sealant Waterproof Clear 300ml',
    sku: 'HW-ADH-SIL-300',
    category: 'Adhesives & Chemicals',
    brand: 'Dr Fixit',
    quantity: 90,
    purchasePrice: 140.00,
    sellingPrice: 230.00,
    wholesalePrice: 185.00,
    gstRate: 18,
    hsnCode: '3506',
    minimumStock: 25,
    supplierName: 'Apex Industrial Supplies',
  },
  {
    name: 'GI Binding Wire 18 Gauge 5kg Roll',
    sku: 'HW-WIR-GI-18G-5KG',
    category: 'Hardware Supplies',
    brand: 'Tata Wiron',
    quantity: 35,
    purchasePrice: 380.00,
    sellingPrice: 550.00,
    wholesalePrice: 460.00,
    gstRate: 18,
    hsnCode: '7217',
    minimumStock: 10,
    supplierName: 'Apex Industrial Supplies',
  },
  {
    name: 'Stainless Steel Butt Hinge 4x3 Inch',
    sku: 'HW-HNG-SS-430',
    category: 'Door Hardware',
    brand: 'Ozone Hardware',
    quantity: 150,
    purchasePrice: 60.00,
    sellingPrice: 110.00,
    wholesalePrice: 85.00,
    gstRate: 18,
    hsnCode: '8302',
    minimumStock: 40,
    supplierName: 'FlowTech Hardware Traders',
  },
  {
    name: 'Cutting Wheel 4 Inch for Angle Grinder',
    sku: 'HW-DSK-CUT-4IN',
    category: 'Abrasives',
    brand: 'Norton Abrasives',
    quantity: 300,
    purchasePrice: 22.00,
    sellingPrice: 45.00,
    wholesalePrice: 32.00,
    gstRate: 18,
    hsnCode: '6804',
    minimumStock: 50,
    supplierName: 'National Tool Agency',
  }
];

// 1. Create CSV file
const csvHeader = 'Product,SKU,Category,Brand,Qty,Purchase Price,Selling Price,Wholesale Price,GST %,HSN,Min Stock,Supplier\n';
const csvRows = products.map(p => 
  `"${p.name}","${p.sku}","${p.category}","${p.brand}",${p.quantity},${p.purchasePrice},${p.sellingPrice},${p.wholesalePrice},${p.gstRate},"${p.hsnCode}",${p.minimumStock},"${p.supplierName}"`
).join('\n');
fs.writeFileSync(path.resolve('sample_hardware_inventory.csv'), csvHeader + csvRows);
console.log('Saved sample_hardware_inventory.csv');

// 2. Create Excel file
async function generateExcel() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Hardware Products');
  sheet.columns = [
    { header: 'Product', key: 'name', width: 35 },
    { header: 'SKU', key: 'sku', width: 22 },
    { header: 'Category', key: 'category', width: 18 },
    { header: 'Brand', key: 'brand', width: 18 },
    { header: 'Qty', key: 'quantity', width: 10 },
    { header: 'Purchase Price', key: 'purchasePrice', width: 15 },
    { header: 'Selling Price', key: 'sellingPrice', width: 15 },
    { header: 'Wholesale Price', key: 'wholesalePrice', width: 16 },
    { header: 'GST %', key: 'gstRate', width: 10 },
    { header: 'HSN', key: 'hsnCode', width: 12 },
    { header: 'Min Stock', key: 'minimumStock', width: 12 },
    { header: 'Supplier', key: 'supplierName', width: 25 },
  ];
  products.forEach(p => sheet.addRow(p));
  await workbook.xlsx.writeFile(path.resolve('sample_hardware_inventory.xlsx'));
  console.log('Saved sample_hardware_inventory.xlsx');
}

// 3. Create PDF file
function buildPdfBuffer(items) {
  const width = 842;
  const height = 595;
  
  const columns = [
    { title: 'Product', x: 40, width: 180 },
    { title: 'SKU', x: 225, width: 100 },
    { title: 'Category', x: 330, width: 85 },
    { title: 'Qty', x: 420, width: 35 },
    { title: 'Purchase Price', x: 460, width: 75 },
    { title: 'Selling Price', x: 540, width: 70 },
    { title: 'Wholesale Price', x: 615, width: 75 },
    { title: 'GST %', x: 695, width: 40 },
    { title: 'HSN', x: 740, width: 40 },
    { title: 'Min Stock', x: 785, width: 45 },
  ];

  let streamContent = '';
  streamContent += 'BT /F1 16 Tf 40 560 Td (Hardware Inventory Product Import Sheet) Tj ET\n';
  streamContent += 'BT /F2 9 Tf 40 545 Td (Sample data template for testing bulk product upload) Tj ET\n';

  streamContent += '0.9 0.9 0.95 rg 35 515 770 20 re f\n';
  streamContent += '0 0 0 rg\n';
  
  for (const col of columns) {
    streamContent += `BT /F1 9 Tf ${col.x} 522 Td (${col.title}) Tj ET\n`;
  }

  let y = 498;
  for (let i = 0; i < items.length; i++) {
    const p = items[i];
    if (i % 2 === 1) {
      streamContent += `0.97 0.97 0.98 rg 35 ${y - 4} 770 16 re f\n0 0 0 rg\n`;
    }
    
    streamContent += `BT /F2 8 Tf ${columns[0].x} ${y} Td (${p.name.replace(/[()]/g, '')}) Tj ET\n`;
    streamContent += `BT /F2 8 Tf ${columns[1].x} ${y} Td (${p.sku}) Tj ET\n`;
    streamContent += `BT /F2 8 Tf ${columns[2].x} ${y} Td (${p.category}) Tj ET\n`;
    streamContent += `BT /F2 8 Tf ${columns[3].x} ${y} Td (${p.quantity}) Tj ET\n`;
    streamContent += `BT /F2 8 Tf ${columns[4].x} ${y} Td (${p.purchasePrice.toFixed(2)}) Tj ET\n`;
    streamContent += `BT /F2 8 Tf ${columns[5].x} ${y} Td (${p.sellingPrice.toFixed(2)}) Tj ET\n`;
    streamContent += `BT /F2 8 Tf ${columns[6].x} ${y} Td (${p.wholesalePrice.toFixed(2)}) Tj ET\n`;
    streamContent += `BT /F2 8 Tf ${columns[7].x} ${y} Td (${p.gstRate}) Tj ET\n`;
    streamContent += `BT /F2 8 Tf ${columns[8].x} ${y} Td (${p.hsnCode}) Tj ET\n`;
    streamContent += `BT /F2 8 Tf ${columns[9].x} ${y} Td (${p.minimumStock}) Tj ET\n`;

    y -= 17;
  }

  streamContent += `0.7 0.7 0.7 RG 35 535 m 805 535 l S\n`;
  streamContent += `0.7 0.7 0.7 RG 35 ${y + 10} m 805 ${y + 10} l S\n`;

  const streamLength = Buffer.byteLength(streamContent, 'latin1');

  const objects = [
    `%PDF-1.4\n`,
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`,
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n`,
    `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
    `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`,
    `6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`,
  ];

  let pdfText = objects.join('');
  let xrefOffset = Buffer.byteLength(pdfText, 'latin1');
  
  let offsets = [0];
  let currentOffset = objects[0].length;
  for (let i = 1; i <= 6; i++) {
    offsets.push(currentOffset);
    currentOffset += objects[i].length;
  }

  let xref = `xref\n0 7\n0000000000 65535 f \n`;
  for (let i = 1; i <= 6; i++) {
    xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  
  let trailer = `trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  
  return Buffer.from(pdfText + xref + trailer, 'latin1');
}

async function run() {
  await generateExcel();
  const pdfBuffer = buildPdfBuffer(products);
  fs.writeFileSync(path.resolve('sample_hardware_inventory.pdf'), pdfBuffer);
  console.log('Saved sample_hardware_inventory.pdf');

  // Verify PDF parser on generated PDF
  const data = new Uint8Array(pdfBuffer);
  const loadingTask = getDocument({ data, standardFontDataUrl: 'node_modules/pdfjs-dist/standard_fonts/' });
  const doc = await loadingTask.promise;
  const page = await doc.getPage(1);
  const textContent = await page.getTextContent();
  console.log(`Verified PDF extraction: page count = ${doc.numPages}, text items count = ${textContent.items.length}`);
}

run().catch(console.error);
