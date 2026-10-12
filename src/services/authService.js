import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import usuarioRepository from '../repositories/usuarioRepository.js';
import clienteRepository from '../repositories/clienteRepository.js';
import emailService from './emailService.js';

/**
 * Servicio encargado de la lógica de negocio de autenticación.
 */
class AuthService {
  /**
   * Procesa el inicio de sesión de un usuario.
   * @param {object} credenciales
   * @param {string} credenciales.correo
   * @param {string} credenciales.password
   * @returns {Promise<{token: string, user: object}>}
   */
  async login({ correo, password }) {
    if (!correo || !password) {
      const error = new Error('El correo y la contraseña son obligatorios');
      error.statusCode = 400;
      throw error;
    }

    const correoNormalizado = String(correo).trim().toLowerCase();

    // 1. Buscar usuario en base de datos vía repositorio
    const usuario = await usuarioRepository.findByCorreo(correoNormalizado);

    if (!usuario) {
      const error = new Error('Correo o contraseña incorrectos');
      error.statusCode = 401;
      throw error;
    }

    // 2. Validar estado del usuario
    if (usuario.estaActivo === 0) {
      const error = new Error('El usuario se encuentra inactivo');
      error.statusCode = 403;
      throw error;
    }

    // 3. Comparar contraseñas mediante hash bcrypt
    const coincide = await bcrypt.compare(String(password), usuario.password);

    if (!coincide) {
      const error = new Error('Correo o contraseña incorrectos');
      error.statusCode = 401;
      throw error;
    }

    // 4. Si el rol es CLIENTE, asegurar su registro en la tabla cliente
    if (usuario.rol === 'CLIENTE') {
      await clienteRepository.asegurarCliente(usuario.id);
    }

    // 5. Verificar configuración de JWT_SECRET
    if (!process.env.JWT_SECRET) {
      const error = new Error('Configuración de autenticación no disponible (JWT_SECRET no configurado)');
      error.statusCode = 500;
      throw error;
    }

    // 6. Generar JWT firmado
    const token = jwt.sign(
      {
        id: usuario.id,
        correo: usuario.correo,
        rol: usuario.rol,
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    // 7. Retornar token y datos del usuario (excluyendo el hash del password)
    return {
      token,
      user: {
        id: usuario.id,
        nombre: usuario.nombre,
        apellidoPaterno: usuario.apellidoPaterno,
        apellidoMaterno: usuario.apellidoMaterno,
        correo: usuario.correo,
        telefono: usuario.telefono,
        rol: usuario.rol,
      },
    };
  }

  /**
   * Registra un nuevo usuario en el sistema.
   * @param {object} datos
   * @returns {Promise<{message: string, userId: number}>}
   */
  async registro(datos) {
    const {
      nombre,
      apellidoPaterno,
      apellidoMaterno,
      correo,
      telefono,
      password,
      rol = 'CLIENTE',
      preguntaSecreta,
      respuestaSecreta,
    } = datos;

    if (!nombre || !correo || !password) {
      const error = new Error('Nombre, correo y contraseña son obligatorios');
      error.statusCode = 400;
      throw error;
    }

    const correoNormalizado = String(correo).trim().toLowerCase();

    // 1. Verificar si el usuario ya existe
    const usuarioExistente = await usuarioRepository.findByCorreo(correoNormalizado);
    if (usuarioExistente) {
      const error = new Error('El correo electrónico ya está registrado');
      error.statusCode = 409;
      throw error;
    }

    // 2. Hashear password
    const passwordHash = await bcrypt.hash(password, 10);

    // 3. Hashear respuesta secreta si existe
    let respuestaSecretaHash = null;
    if (respuestaSecreta) {
      respuestaSecretaHash = await bcrypt.hash(respuestaSecreta, 10);
    }

    // 4. Crear usuario en BD
    const nuevoUsuarioId = await usuarioRepository.create({
      nombre: nombre.trim(),
      apellidoPaterno: apellidoPaterno ? apellidoPaterno.trim() : null,
      apellidoMaterno: apellidoMaterno ? apellidoMaterno.trim() : null,
      correo: correoNormalizado,
      telefono: telefono ? telefono.trim() : null,
      password: passwordHash,
      rol,
      preguntaSecreta: preguntaSecreta ? preguntaSecreta.trim() : null,
      respuestaSecretaHash,
    });

    // 5. Si es rol CLIENTE, asegurar registro en tabla cliente
    if (rol === 'CLIENTE') {
      await clienteRepository.asegurarCliente(nuevoUsuarioId);
    }

    return {
      message: 'Usuario registrado exitosamente',
      userId: nuevoUsuarioId,
    };
  }

  /**
   * Solicita el restablecimiento de contraseña para un correo dado.
   * Genera un token temporal de 1 hora y envía el correo con Brevo.
   * @param {string} correo
   * @returns {Promise<{ok: boolean, message: string}>}
   */
  async solicitarRecuperacionPassword(correo) {
    if (!correo) {
      const error = new Error('El correo electrónico es obligatorio');
      error.statusCode = 400;
      throw error;
    }

    const correoNormalizado = String(correo).trim().toLowerCase();

    // 1. Buscar si el usuario existe
    const usuario = await usuarioRepository.findByCorreo(correoNormalizado);

    if (!usuario) {
      console.log(`ℹ️ Solicitud de recuperación para correo no registrado: ${correoNormalizado}`);
      // Respondemos 200 genérico para evitar enumeración de correos
      return {
        ok: true,
        message: 'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.',
      };
    }

    if (!process.env.JWT_SECRET) {
      const error = new Error('JWT_SECRET no configurado');
      error.statusCode = 500;
      throw error;
    }

    // 2. Generar token temporal de 1 hora
    const token = jwt.sign(
      { id: usuario.id, correo: usuario.correo },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // 3. Enviar correo usando el servicio de email
    await emailService.enviarCorreoRecuperacion(usuario.correo, token);

    return {
      ok: true,
      message: 'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.',
    };
  }

  /**
   * Restablece la contraseña de un usuario mediante el token recibido por correo.
   * @param {object} params
   * @param {string} params.token
   * @param {string} params.newPassword
   * @returns {Promise<{ok: boolean, message: string}>}
   */
  async restablecerPassword({ token, newPassword }) {
    if (!token || !newPassword) {
      const error = new Error('Token y nueva contraseña son obligatorios');
      error.statusCode = 400;
      throw error;
    }

    if (!process.env.JWT_SECRET) {
      const error = new Error('JWT_SECRET no configurado');
      error.statusCode = 500;
      throw error;
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      const error = new Error('El enlace de recuperación es inválido o ha expirado');
      error.statusCode = 400;
      throw error;
    }

    // Hashear nueva contraseña
    const passwordHash = await bcrypt.hash(String(newPassword), 10);

    // Actualizar en base de datos
    await usuarioRepository.updatePassword(decoded.id, passwordHash);

    return {
      ok: true,
      message: 'Tu contraseña ha sido restablecida con éxito. Ya puedes iniciar sesión.',
    };
  }
}

export default new AuthService();

