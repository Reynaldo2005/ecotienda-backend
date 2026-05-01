const db = require('../config/db');

// Ver todas las ofertas activas (clientes)
const obtenerOfertas = async (req, res) => {
  const usuario_id = req.usuario.id;
  try {
    // Obtener kilos del cliente
    const [saldo] = await db.query(
      'SELECT kilos_totales FROM saldo_cliente WHERE usuario_id = ?',
      [usuario_id]
    );
    const kilos_cliente = saldo.length > 0 ? parseFloat(saldo[0].kilos_totales) : 0;

    // Obtener ofertas activas
    const [ofertas] = await db.query(`
      SELECT id, titulo, descripcion, imagen_url, 
             kilos_requeridos, stock, creado_en
      FROM ofertas
      WHERE activo = true AND stock > 0
      ORDER BY creado_en DESC
    `);

    // Agregar progreso y verificar si ya reclamó
const ofertasConProgreso = await Promise.all(ofertas.map(async oferta => {
  const progreso = Math.min(
    Math.round((kilos_cliente / oferta.kilos_requeridos) * 100), 100
  );

  // Verificar si ya reclamó esta oferta
  const [reclamoExistente] = await db.query(
    'SELECT id, estado FROM reclamos_oferta WHERE usuario_id = ? AND oferta_id = ? AND estado IN ("pendiente", "entregado")',
    [usuario_id, oferta.id]
  );
  const yaReclamo = reclamoExistente.length > 0;
  const estadoReclamo = reclamoExistente[0]?.estado || null;

  return {
    ...oferta,
    kilos_cliente,
    progreso,
    puede_reclamar: kilos_cliente >= oferta.kilos_requeridos && !yaReclamo,
    ya_reclamado: yaReclamo,
    estado_reclamo: estadoReclamo
  };
}));

    res.json(ofertasConProgreso);
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
};

// Reclamar una oferta (cliente)
const reclamarOferta = async (req, res) => {
  const usuario_id = req.usuario.id;
  const { oferta_id } = req.body;

  try {
    // Verificar que la oferta existe y tiene stock
    const [ofertas] = await db.query(
      'SELECT id, titulo, kilos_requeridos, stock FROM ofertas WHERE id = ? AND activo = true',
      [oferta_id]
    );
    if (ofertas.length === 0) {
      return res.status(404).json({ error: 'Oferta no encontrada' });
    }

    const oferta = ofertas[0];

    if (oferta.stock <= 0) {
      return res.status(400).json({ error: 'Oferta sin stock disponible' });
    }

    // Verificar kilos del cliente
    const [saldo] = await db.query(
      'SELECT kilos_totales FROM saldo_cliente WHERE usuario_id = ?',
      [usuario_id]
    );
    const kilos_cliente = saldo.length > 0 ? parseFloat(saldo[0].kilos_totales) : 0;

    if (kilos_cliente < oferta.kilos_requeridos) {
      return res.status(400).json({
        error: `Necesitas ${oferta.kilos_requeridos} kg para reclamar esta oferta. Llevas ${kilos_cliente} kg.`
      });
    }

    // Verificar que no haya reclamado esta oferta antes (pendiente o entregado)
    const [reclamos] = await db.query(
      'SELECT id, estado FROM reclamos_oferta WHERE usuario_id = ? AND oferta_id = ? AND estado IN ("pendiente", "entregado")',
      [usuario_id, oferta_id]
    );
    if (reclamos.length > 0) {
      const estado = reclamos[0].estado;
      const mensaje = estado === 'pendiente'
        ? 'Ya tienes un reclamo pendiente para esta oferta'
        : 'Ya reclamaste y recibiste esta oferta anteriormente';
      return res.status(400).json({ error: mensaje });
    }

    // Crear el reclamo
    await db.query(
      'INSERT INTO reclamos_oferta (usuario_id, oferta_id, estado) VALUES (?, ?, "pendiente")',
      [usuario_id, oferta_id]
    );

    // Reducir stock
    await db.query(
      'UPDATE ofertas SET stock = stock - 1 WHERE id = ?',
      [oferta_id]
    );

    res.status(201).json({
      mensaje: `✅ Oferta "${oferta.titulo}" reclamada correctamente. El administrador se pondrá en contacto contigo.`
    });

  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
};

// Crear oferta (admin)
const crearOferta = async (req, res) => {
  const { titulo, descripcion, imagen_url, kilos_requeridos, stock } = req.body;
  try {
    const [resultado] = await db.query(`
      INSERT INTO ofertas (titulo, descripcion, imagen_url, kilos_requeridos, stock)
      VALUES (?, ?, ?, ?, ?)
    `, [titulo, descripcion, imagen_url, kilos_requeridos, stock]);

    res.status(201).json({
      mensaje: 'Oferta creada correctamente',
      id: resultado.insertId
    });
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
};

// Ver todos los reclamos pendientes (admin)
const obtenerReclamos = async (req, res) => {
  try {
    const [reclamos] = await db.query(`
      SELECT r.id, u.nombre, u.apellido, u.telefono,
             u.direccion, o.titulo AS oferta,
             o.kilos_requeridos, r.estado, r.fecha
      FROM reclamos_oferta r
      JOIN usuarios u ON r.usuario_id = u.id
      JOIN ofertas o ON r.oferta_id = o.id
      WHERE r.estado = 'pendiente'
      ORDER BY r.fecha ASC
    `);
    res.json(reclamos);
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
};

// Cambiar estado de un reclamo (admin)
const cambiarEstadoReclamo = async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;

  const estadosValidos = ['entregado', 'cancelado'];
  if (!estadosValidos.includes(estado)) {
    return res.status(400).json({ error: 'Estado no válido' });
  }

  try {
    const [reclamo] = await db.query(
      'SELECT id, oferta_id, estado FROM reclamos_oferta WHERE id = ?', [id]
    );
    if (reclamo.length === 0) {
      return res.status(404).json({ error: 'Reclamo no encontrado' });
    }
    if (reclamo[0].estado !== 'pendiente') {
      return res.status(400).json({ error: 'Este reclamo ya fue procesado' });
    }

    await db.query(
      'UPDATE reclamos_oferta SET estado = ? WHERE id = ?',
      [estado, id]
    );

    // Si se cancela, devolver stock a la oferta
    if (estado === 'cancelado') {
      await db.query(
        'UPDATE ofertas SET stock = stock + 1 WHERE id = ?',
        [reclamo[0].oferta_id]
      );
    }

    const mensajes = {
      'entregado': '✅ Reclamo marcado como entregado',
      'cancelado': '❌ Reclamo cancelado y stock devuelto'
    };

    res.json({ mensaje: mensajes[estado] });
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
};

// Eliminar oferta (admin)
const eliminarOferta = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('UPDATE ofertas SET activo = false WHERE id = ?', [id]);
    res.json({ mensaje: 'Oferta eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
};

module.exports = {
  obtenerOfertas, reclamarOferta, crearOferta,
  obtenerReclamos, cambiarEstadoReclamo, eliminarOferta
};