import { createHmac, timingSafeEqual } from 'node:crypto';

const unauthorized = () => Object.assign(new Error('Firma de Mercado Pago inválida'), { statusCode: 401 });

export const verifyMercadoPagoSignature = ({ signature, requestId, dataId, secret }) => {
  if (!signature || !requestId || !dataId || !secret) throw unauthorized();

  const parts = Object.fromEntries(
    String(signature).split(',').map((part) => {
      const [key, ...value] = part.trim().split('=');
      return [key, value.join('=')];
    })
  );
  if (!/^\d+$/.test(parts.ts || '') || !/^[a-f0-9]{64}$/i.test(parts.v1 || '')) {
    throw unauthorized();
  }

  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const expected = Buffer.from(createHmac('sha256', secret).update(manifest).digest('hex'), 'utf8');
  const received = Buffer.from(parts.v1.toLowerCase(), 'utf8');
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw unauthorized();
  return true;
};
