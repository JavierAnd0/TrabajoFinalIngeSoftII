import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { OfficialCertificateRenderData } from '../../domain/entities/CertificateWorkerEntities';
import { IPdfGeneratorPort } from '../../domain/ports/ICertificatePorts';

const CERTIFICATE_TITLES: Record<string, string> = {
  STUDY: 'CERTIFICADO OFICIAL DE ESTUDIOS Y MATRÍCULA ACTIVA',
  GRADES: 'CERTIFICADO OFICIAL DE CALIFICACIONES PONDERADAS (30% / 30% / 40%)',
  GOOD_STANDING: 'CERTIFICADO INSTITUCIONAL DE PAZ Y SALVO ACADÉMICO Y FINANCIERO',
};

export class PdfCertificateGenerator implements IPdfGeneratorPort {
  public async generateOfficialCertificatePdf(
    data: OfficialCertificateRenderData
  ): Promise<Buffer> {
    const qrPayload = JSON.stringify({
      issuer: 'Universidad Surcolombiana - EduDistribuida (USCO-Net)',
      code: data.verificationCode,
      studentCode: data.student.studentCode,
      document: data.student.documentNumber,
      type: data.certificateType,
      pga: data.metrics.pga,
      sha256: data.digitalSignatureHash.slice(0, 24),
      verifyUrl: data.verificationUrl,
    });

    const qrDataUrl = await QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 115,
      color: {
        dark: '#8F141B',
        light: '#FFFFFF',
      },
    });
    const qrBase64 = qrDataUrl.replace(/^data:image\/png;base64,/, '');
    const qrImageBuffer = Buffer.from(qrBase64, 'base64');

    return await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 42, bottom: 42, left: 48, right: 48 },
        info: {
          Title: `${CERTIFICATE_TITLES[data.certificateType] || 'Certificado USCO'} - ${data.verificationCode}`,
          Author: 'Universidad Surcolombiana (EduDistribuida / USCO-Net)',
          Subject: `Certificado Académico Digital - Código ${data.verificationCode}`,
          Keywords: 'USCO, EduDistribuida, Certificado, Firma Digital SHA-256, QR',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      // 1. Franja Superior Institucional USCO (Vinotinto #8F141B y Dorado #D4AF37)
      doc.rect(48, 38, 516, 58).fill('#8F141B');
      doc.rect(48, 96, 516, 4).fill('#D4AF37');

      doc
        .fillColor('#FFFFFF')
        .font('Helvetica-Bold')
        .fontSize(14)
        .text('UNIVERSIDAD SURCOLOMBIANA (USCO)', 60, 48, { align: 'left' });

      doc
        .fillColor('#FDE68A')
        .font('Helvetica')
        .fontSize(9)
        .text(
          'PLATAFORMA ACADÉMICA DESCENTRALIZADA EDUDISTRIBUIDA / USCO-NET — NIT 891.180.084-2',
          60,
          67
        );

      doc
        .fillColor('#FFFFFF')
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .text(`SEDE: ${data.student.campusName.toUpperCase()}`, 60, 81);

      // 2. Código de Verificación y Metadatos Superiores
      doc
        .fillColor('#1E293B')
        .font('Helvetica-Bold')
        .fontSize(11)
        .text(
          CERTIFICATE_TITLES[data.certificateType] || CERTIFICATE_TITLES.STUDY,
          48,
          116,
          { align: 'center', width: 516 }
        );

      doc
        .fillColor('#475569')
        .font('Helvetica')
        .fontSize(8.5)
        .text(
          `Código de Verificación Único: ${data.verificationCode}   |   Fecha de Expedición: ${new Date(
            data.issuedAtIso
          ).toLocaleString('es-CO')}`,
          48,
          134,
          { align: 'center', width: 516 }
        );

      // 3. Cuerpo de Certificación Institucional
      doc
        .fillColor('#0F172A')
        .font('Helvetica')
        .fontSize(9.5)
        .text(
          `La Jefatura de Registro y Control Académico de la Universidad Surcolombiana certifica que el(la) estudiante identificado(a) a continuación se encuentra registrado(a) con matrícula activa en el sistema distribuido multi-sede durante el periodo académico ${data.period.code} (${data.period.name}):`,
          48,
          156,
          { align: 'justify', width: 516 }
        );

      // 4. Ficha Técnica del Estudiante
      const boxTop = 192;
      doc.roundedRect(48, boxTop, 516, 72, 4).fillAndStroke('#F8FAFC', '#CBD5E1');

      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(9);
      doc.text('ESTUDIANTE:', 60, boxTop + 10);
      doc.font('Helvetica').text(data.student.fullName, 145, boxTop + 10);

      doc.font('Helvetica-Bold').text('CÓDIGO ESTUDIANTIL:', 330, boxTop + 10);
      doc.font('Helvetica').text(data.student.studentCode, 445, boxTop + 10);

      doc.font('Helvetica-Bold').text('DOCUMENTO ID:', 60, boxTop + 26);
      doc.font('Helvetica').text(`C.C. ${data.student.documentNumber}`, 145, boxTop + 26);

      doc.font('Helvetica-Bold').text('CORREO INSTITUCIONAL:', 330, boxTop + 26);
      doc.font('Helvetica').text(data.student.email, 445, boxTop + 26);

      doc.font('Helvetica-Bold').text('PROGRAMA:', 60, boxTop + 42);
      doc
        .font('Helvetica')
        .text(`${data.student.programName} (${data.student.programCode})`, 145, boxTop + 42);

      doc.font('Helvetica-Bold').text('ESTADO FINANCIERO:', 330, boxTop + 42);
      doc.fillColor('#15803D').font('Helvetica-Bold').text(data.metrics.financialStatus, 445, boxTop + 42);

      doc.fillColor('#0F172A').font('Helvetica-Bold').text('SEDE REGIONAL:', 60, boxTop + 56);
      doc
        .font('Helvetica')
        .text(`${data.student.campusName} (${data.student.campusCity})`, 145, boxTop + 56);

      doc.font('Helvetica-Bold').text('PROMEDIO (PGA):', 330, boxTop + 56);
      doc
        .fillColor('#8F141B')
        .font('Helvetica-Bold')
        .text(`${data.metrics.pga.toFixed(2)} / 5.00`, 445, boxTop + 56);

      // 5. Tabla de Asignaturas y Calificaciones por Corte (30% / 30% / 40%)
      let currentY = 278;
      doc
        .fillColor('#8F141B')
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .text(
          `REGISTRO DE ASIGNATURAS Y EVALUACIÓN POR CORTES — PERIODO ${data.period.code}`,
          48,
          currentY
        );

      currentY += 16;
      doc.rect(48, currentY, 516, 20).fill('#1E293B');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
      doc.text('CÓDIGO', 54, currentY + 6);
      doc.text('ASIGNATURA MATRICULADA', 105, currentY + 6);
      doc.text('CR', 278, currentY + 6);
      doc.text('C1 (30%)', 305, currentY + 6);
      doc.text('C2 (30%)', 352, currentY + 6);
      doc.text('C3 (40%)', 400, currentY + 6);
      doc.text('DEF.', 450, currentY + 6);
      doc.text('ESTADO', 488, currentY + 6);

      currentY += 20;

      data.courses.forEach((course, index) => {
        const rowBg = index % 2 === 0 ? '#FFFFFF' : '#F1F5F9';
        doc.rect(48, currentY, 516, 20).fillAndStroke(rowBg, '#E2E8F0');

        doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(8);
        doc.text(course.courseCode, 54, currentY + 6);

        doc.font('Helvetica').fontSize(8);
        doc.text(course.courseName.slice(0, 34), 105, currentY + 6);
        doc.text(String(course.credits), 281, currentY + 6);
        doc.text(
          course.cut1 !== null ? course.cut1.toFixed(1) : 'Pend.',
          312,
          currentY + 6
        );
        doc.text(
          course.cut2 !== null ? course.cut2.toFixed(1) : 'Pend.',
          359,
          currentY + 6
        );
        doc.text(
          course.cut3 !== null ? course.cut3.toFixed(1) : 'Pend.',
          407,
          currentY + 6
        );

        doc.font('Helvetica-Bold').text(course.finalGrade.toFixed(2), 450, currentY + 6);

        const statusColor =
          course.statusText === 'APROBADA'
            ? '#15803D'
            : course.statusText === 'EN CURSO'
              ? '#B45309'
              : '#B91C1C';
        doc
          .fillColor(statusColor)
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .text(course.statusText, 488, currentY + 6);

        currentY += 20;
      });

      // Resumen inferior de tabla
      currentY += 8;
      doc
        .fillColor('#334155')
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .text(
          `Total Asignaturas Matriculadas: ${data.metrics.enrolledCoursesCount}   |   Total Créditos Inscritos: ${data.metrics.enrolledCredits}   |   Promedio General Acumulado (PGA): ${data.metrics.pga.toFixed(2)}`,
          48,
          currentY
        );

      // 6. Bloque de Firma Digital Criptográfica SHA-256 + Código QR
      const footerTop = Math.max(currentY + 26, 520);
      doc
        .roundedRect(48, footerTop, 516, 125, 4)
        .fillAndStroke('#FFFBEB', '#D4AF37');

      doc.image(qrImageBuffer, 58, footerTop + 8, { width: 105, height: 105 });

      doc
        .fillColor('#8F141B')
        .font('Helvetica-Bold')
        .fontSize(9)
        .text(
          'SELLO CRIPTOGRÁFICO DE AUTENTICIDAD Y VERIFICACIÓN EN LÍNEA',
          176,
          footerTop + 12
        );

      doc
        .fillColor('#1E293B')
        .font('Helvetica')
        .fontSize(8)
        .text(
          'Este documento electrónico ha sido generado de manera desacoplada por el microservicio Async Worker (BullMQ + PDFKit) de la plataforma EduDistribuida. Su integridad puede verificarse escaneando el código QR adjunto o validando la firma criptográfica SHA-256:',
          176,
          footerTop + 26,
          { width: 374, align: 'justify' }
        );

      doc
        .fillColor('#0F172A')
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .text('HASH DIGITAL SHA-256:', 176, footerTop + 64);

      doc
        .fillColor('#334155')
        .font('Courier-Bold')
        .fontSize(7.2)
        .text(data.digitalSignatureHash, 176, footerTop + 76, { width: 374 });

      doc
        .fillColor('#0F172A')
        .font('Helvetica-Bold')
        .fontSize(8)
        .text(
          `CÓDIGO DE VERIFICACIÓN: ${data.verificationCode}   |   ID JOB: ${data.jobId}`,
          176,
          footerTop + 94
        );

      doc
        .fillColor('#475569')
        .font('Helvetica')
        .fontSize(7.5)
        .text(
          'Firmado digitalmente por: Dra. María Fernanda Perdomo — Registro y Control Académico USCO',
          176,
          footerTop + 108
        );

      doc.end();
    });
  }
}
