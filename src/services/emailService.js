/**
 * Servicio de mensajería por correo electrónico.
 * Utiliza la API REST de Brevo (HTTPS) para el envío seguro de correos transaccionales.
 */
class EmailService {
  /**
   * Envía un correo con el token de recuperación usando la API REST de Brevo.
   * @param {string} correo - Correo destinatario
   * @param {string} token - Token JWT de restablecimiento
   * @returns {Promise<object>} Respuesta de la API de Brevo
   */
  async enviarCorreoRecuperacion(correo, token) {
    const apiKey = process.env.BREVO_API_KEY;

    if (!apiKey) {
      console.error('❌ Falta configurar BREVO_API_KEY en las variables de entorno.');
      throw new Error('Servicio de correo no configurado (falta BREVO_API_KEY).');
    }

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').trim().replace(/\/+$/, '');
    const urlRecuperacion = `${frontendUrl}/restablecer-contrasena?token=${token}`;

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Restablecer Contraseña | Lady Barber</title>
        <style>
          body {
            margin: 0;
            padding: 0;
            background-color: #F1F5F9;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            color: #1E293B;
          }
          .container {
            max-width: 600px;
            margin: 40px auto;
            background-color: #FFFFFF;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
            border: 1px solid #E2E8F0;
          }
          .header {
            background-color: #0F172A;
            padding: 30px;
            text-align: center;
            border-bottom: 4px solid #EA580C;
          }
          .header h1 {
            color: #FFFFFF;
            margin: 0;
            font-size: 24px;
            font-weight: 700;
            letter-spacing: 0.05em;
          }
          .content {
            padding: 40px 30px;
            line-height: 1.6;
          }
          .content h2 {
            color: #0F172A;
            margin-top: 0;
            font-size: 20px;
          }
          .content p {
            color: #475569;
            font-size: 16px;
            margin-bottom: 24px;
          }
          .btn-container {
            text-align: center;
            margin: 35px 0;
          }
          .btn {
            background-color: #2563EB;
            color: #FFFFFF !important;
            padding: 14px 30px;
            text-decoration: none;
            font-weight: 600;
            border-radius: 12px;
            font-size: 16px;
            display: inline-block;
            box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);
          }
          .footer {
            background-color: #F8FAFC;
            padding: 24px;
            text-align: center;
            font-size: 13px;
            color: #64748B;
            border-top: 1px solid #F1F5F9;
          }
          .footer a {
            color: #2563EB;
            text-decoration: none;
          }
          .link-text {
            word-break: break-all;
            font-size: 12px;
            color: #94A3B8;
            background-color: #F8FAFC;
            padding: 10px;
            border-radius: 8px;
            border: 1px dashed #E2E8F0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>LADY BARBER ITZA D'M</h1>
          </div>
          <div class="content">
            <h2>Hola,</h2>
            <p>Hemos recibido una solicitud para restablecer la contraseña de tu cuenta asociada a este correo electrónico.</p>
            <p>Para crear una nueva contraseña, haz clic en el siguiente botón. Este enlace será válido por <strong>1 hora</strong>.</p>
            
            <div class="btn-container">
              <a href="${urlRecuperacion}" class="btn" target="_blank">Restablecer contraseña</a>
            </div>
            
            <p>Si no puedes ver el botón o no funciona, puedes copiar y pegar el siguiente enlace en tu navegador:</p>
            <div class="link-text">${urlRecuperacion}</div>
            
            <p style="margin-top: 24px; font-size: 14px; color: #64748B;">
              Si tú no solicitaste este cambio, puedes ignorar este correo de forma segura; tu contraseña seguirá siendo la misma.
            </p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Lady Barber Itza D'M. Todos los derechos reservados.</p>
            <p>Si tienes alguna pregunta, contáctanos en <a href="mailto:salonladybarberitza@gmail.com">salonladybarberitza@gmail.com</a></p>
          </div>
        </div>
      </body>
      </html>
    `;

    const payload = {
      sender: {
        name: "Lady Barber Itza D'M",
        email: 'salonladybarberitza@gmail.com',
      },
      to: [
        {
          email: correo.trim().toLowerCase(),
        },
      ],
      subject: "Restablecer contraseña - Lady Barber Itza D'M",
      htmlContent: htmlContent,
    };

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'api-key': apiKey.trim(),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const mensajeError =
        errorData?.message || `Error en la API de Brevo (HTTP ${response.status}): ${response.statusText}`;
      console.error('❌ Error de Brevo API:', mensajeError);
      throw new Error(`Error al enviar correo: ${mensajeError}`);
    }

    const data = await response.json().catch(() => ({}));
    return data;
  }
}

export default new EmailService();
export const emailService = new EmailService();
