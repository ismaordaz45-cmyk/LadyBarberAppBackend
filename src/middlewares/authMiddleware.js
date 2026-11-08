import jwt from 'jsonwebtoken';
import usuarioRepository from '../repositories/usuarioRepository.js';

export const verificarToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: "No se proporcionó un token válido" });
    }

    const token = authHeader.split(' ')[1];
    
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET no está configurado");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, correo, rol }
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: "El token ha expirado" });
    }
    return res.status(401).json({ error: "Token inválido" });
  }
};

export const verificarRol = (rolEsperado) => {
  return (req, res, next) => {
    if (!req.user || req.user.rol !== rolEsperado) {
      return res.status(403).json({ error: `Acceso denegado. Se requiere rol: ${rolEsperado}` });
    }
    next();
  };
};

export const crearVerificadorCuentaActiva = (repository = usuarioRepository) => {
  return async (req, res, next) => {
    try {
      const usuario = await repository.findById(req.user?.id);
      if (!usuario || usuario.estaActivo !== 1) {
        return res.status(401).json({ error: 'La cuenta ya no está disponible' });
      }
      req.user.rol = usuario.rol;
      return next();
    } catch (error) {
      return next(error);
    }
  };
};

export const verificarCuentaActiva = crearVerificadorCuentaActiva();
