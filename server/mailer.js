// server/mailer.js — Servicio de envío de correos (Nodemailer + Gmail SMTP)
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

// Crea el transporter solo si las credenciales están configuradas
function createTransporter() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return null;
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587');
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    family: 4,
    connectionTimeout: 10000,
    greetingTimeout:   10000,
    socketTimeout:     15000,
    tls: { servername: host },
    auth: { user, pass },
  });
}

async function sendWithResend({ to, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const fromEmail = process.env.RESEND_FROM_EMAIL || process.env.SMTP_USER;
  if (!fromEmail) {
    throw new Error('RESEND_FROM_EMAIL o SMTP_USER debe estar configurado para enviar OTP.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `USIL Radar <${fromEmail}>`,
      to,
      subject: 'Codigo de verificacion - USIL Radar',
      html,
      text,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Resend rechazo el correo OTP (${response.status}): ${body}`);
  }

  console.log(`[MAILER] OTP enviado por Resend a: ${to}`);
  return true;
}

/**
 * Envía el correo con el código OTP de 6 dígitos.
 * Si SMTP no está configurado, imprime el código en consola (modo desarrollo).
 *
 * @param {{ to: string, nombre: string, otp: string }} opts
 */
export async function sendOtpEmail({ to, nombre, otp }) {
  const transporter = createTransporter();

  if (!transporter) {
    console.warn('\n⚠️  [MAILER] SMTP no configurado. Configura SMTP_USER y SMTP_PASS en .env');
    console.warn(`   OTP para ${to}: ${otp}\n`);
    return;
  }

  // Formatear el código con espacios para mejor legibilidad: 123 456
  const otpFormatted = `${otp.slice(0, 3)} ${otp.slice(3)}`;

  const html = `
  <!DOCTYPE html>
  <html lang="es">
  <head><meta charset="UTF-8"/></head>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
      <tr><td align="center">
        <table width="560" cellpadding="0" cellspacing="0"
          style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header azul -->
          <tr>
            <td style="background:#0045ad;padding:32px 40px;text-align:center;">
              <p style="margin:0;color:rgba(255,255,255,0.7);font-size:11px;
                         letter-spacing:0.15em;text-transform:uppercase;font-weight:700;">
                Universidad San Ignacio de Loyola
              </p>
              <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:800;
                          letter-spacing:-0.5px;">
                Radar de Prospección
              </h1>
            </td>
          </tr>

          <!-- Cuerpo -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 8px;color:#0f172a;font-size:20px;font-weight:700;">
                Hola, ${nombre} 👋
              </h2>
              <p style="margin:0 0 28px;color:#475569;font-size:15px;line-height:1.6;">
                Recibimos una solicitud de verificación de seguridad para tu cuenta institucional.
                Ingresa el siguiente código de 6 dígitos en la plataforma:
              </p>

              <!-- Código OTP destacado -->
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="padding:8px 0 32px;">
                    <div style="display:inline-block;background:#eff6ff;border:2px solid #bfdbfe;
                                border-radius:16px;padding:20px 40px;">
                      <p style="margin:0 0 4px;color:#64748b;font-size:12px;
                                 text-transform:uppercase;letter-spacing:0.1em;font-weight:600;">
                        Código de verificación
                      </p>
                      <p style="margin:0;color:#0045ad;font-size:44px;font-weight:800;
                                 letter-spacing:10px;font-family:monospace;">
                        ${otpFormatted}
                      </p>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Info box -->
              <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;
                           padding:16px 20px;margin-bottom:24px;">
                <p style="margin:0 0 4px;color:#92400e;font-size:14px;font-weight:700;">
                  ⏱ Este código expira en 5 minutos.
                </p>
                <p style="margin:0;color:#b45309;font-size:13px;">
                  Si no solicitaste este código, ignora este mensaje. Tu cuenta permanece segura.
                </p>
              </div>

              <p style="margin:0;color:#94a3b8;font-size:12px;">
                Por seguridad, nunca compartas este código con nadie.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;
                        padding:20px 40px;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:11px;">
                © 2024 Universidad San Ignacio de Loyola · Sistema de Acceso Restringido
              </p>
            </td>
          </tr>

        </table>
      </td></tr>
    </table>
  </body>
  </html>`;

  const text = `Hola ${nombre},\n\nTu codigo de verificacion es: ${otp}\n\nExpira en 5 minutos.\n\nSi no solicitaste este codigo, ignora este mensaje.\n\nUSIL`;

  try {
    const sentByResend = await sendWithResend({ to, html, text });
    if (sentByResend) return;

    await transporter.sendMail({
      from:    `"USIL Radar de Prospeccion" <${process.env.SMTP_USER}>`,
      to,
      subject: 'Codigo de verificacion - USIL Radar',
      html,
      text,
    });

  } catch (err) {
    console.error(`[MAILER] No se pudo enviar OTP a ${to}:`, err.message);
    throw new Error('No se pudo enviar el codigo OTP. Verifica la configuracion SMTP.');
  }

  console.log(`[MAILER] ✉️  OTP enviado a: ${to}`);
}
