const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// REGISTRO
const registro = async (req, res) => {
  const { nombre, apellido, correo, contraseña, telefono, direccion } = req.body;

  try {
    // Verificar si el nombre de usuario ya existe
    const [existenteNombre] = await db.query(
      'SELECT id FROM usuarios WHERE nombre = ?', [nombre]
    );
    if (existenteNombre.length > 0) {
      return res.status(400).json({ error: 'El nombre de usuario ya está registrado' });
    }

    // Verificar si el correo ya existe
    const [existenteCorreo] = await db.query(
      'SELECT id FROM usuarios WHERE correo = ?', [correo]
    );
    if (existenteCorreo.length > 0) {
      return res.status(400).json({ error: 'El correo ya está registrado' });
    }

    // Cifrar la contraseña
    const hash = await bcrypt.hash(contraseña, 10);

    // Insertar usuario
    const [resultado] = await db.query(
      `INSERT INTO usuarios (nombre, apellido, correo, contraseña, telefono, direccion, ciudad, rol)
       VALUES (?, ?, ?, ?, ?, ?, 'Aucayacu', 'cliente')`,
      [nombre, apellido, correo, hash, telefono, direccion]
    );

    // Crear saldo inicial del cliente
    await db.query(
      'INSERT INTO saldo_cliente (usuario_id, puntos_actuales, kilos_totales) VALUES (?, 0, 0)',
      [resultado.insertId]
    );
    // Crear dirección de entrega inicial con la dirección del registro
    await db.query(
      'INSERT INTO direcciones_entrega (usuario_id, calle, es_principal) VALUES (?, ?, true)',
      [resultado.insertId, direccion || 'Sin dirección registrada']
    );

    res.status(201).json({ mensaje: 'Usuario registrado correctamente' });

  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
};

// LOGIN
const login = async (req, res) => {
  const { nombre, contraseña } = req.body;

  try {
    // Buscar usuario por nombre
    const [usuarios] = await db.query(
      'SELECT * FROM usuarios WHERE nombre = ?', [nombre]
    );
    if (usuarios.length === 0) {
      return res.status(401).json({ error: 'Nombre o contraseña incorrectos' });
    }

    const usuario = usuarios[0];

    // Verificar contraseña
    const coincide = await bcrypt.compare(contraseña, usuario.contraseña);
    if (!coincide) {
      return res.status(401).json({ error: 'Nombre o contraseña incorrectos' });
    }

    // Obtener saldo del usuario
    const [saldo] = await db.query(
      'SELECT puntos_actuales, kilos_totales FROM saldo_cliente WHERE usuario_id = ?',
      [usuario.id]
    );

    // Generar token JWT
    const token = jwt.sign(
      { id: usuario.id, rol: usuario.rol },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      mensaje: 'Login exitoso',
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        correo: usuario.correo,
        rol: usuario.rol,
        puntos_actuales: saldo[0]?.puntos_actuales || 0,
        kilos_totales: saldo[0]?.kilos_totales || 0
      }
    });

  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
};

module.exports = { registro, login };