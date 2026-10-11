// Synthetic teaching text only; no personal documents are used in browser QA.
export function makeTestPdf() {
  const pages=[
    ["AirBoard classroom rehearsal","Semiconductors and logic","A MOSFET controls current using an electric field.","The gate is separated from silicon by an oxide barrier.","Click or drag with the highlighter to mark this sentence.","Use Add to lesson to place a 3D model beside this PDF."],
    ["AirBoard classroom rehearsal - page two","Functions and computation","A Fourier series combines sinusoidal harmonics.","f(x) = sin(x) + 0.45 * sin(3*x)","A one-bit full result has a sum and a carry.","Annotations stay with their own PDF page."]
  ];
  const streams=pages.map(lines=>"BT /F1 24 Tf 60 720 Td "+lines.map((text,i)=>(i?"0 -48 Td ":"")+`(${text}) Tj`).join(" ")+" ET");
  const objects=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>","<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 850] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>","<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 850] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",...streams.map(s=>`<< /Length ${Buffer.byteLength(s)} >>\nstream\n${s}\nendstream`)];
  let text="%PDF-1.4\n";const offsets=[0];
  objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(text));text+=`${i+1} 0 obj\n${object}\nendobj\n`;});
  const xref=Buffer.byteLength(text);text+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,"0")} 00000 n \n`).join("")+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(text);
}
