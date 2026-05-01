const db = require('../config/db');

// Ver todos los clientes registrados
const obtenerClientes = async (req, res) => {
  try {
    const [clientes] = await db.query(`
    SELECT u.id, u.nombre, u.apellido, u.correo, u.telefono,
          u.direccion, u.creado_en, u.foto_perfil,
          s.puntos_actuales, s.kilos_totales
    FROM usuarios u
    LEFT JOIN saldo_cliente s ON u.id = s.usuario_id
    WHERE u.rol = 'cliente'
    ORDER BY u.creado_en DESC
  `);
    res.json(clientes);
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
};

// Buscar cliente por nombre
const buscarCliente = async (req, res) => {
  const { nombre } = req.query;
  try {
    const [clientes] = await db.query(`
      SELECT u.id, u.nombre, u.apellido, u.correo, u.telefono,
             u.direccion, u.creado_en, u.foto_perfil,
             s.puntos_actuales, s.kilos_totales
      FROM usuarios u
      LEFT JOIN saldo_cliente s ON u.id = s.usuario_id
      WHERE u.rol = 'cliente' 
        AND (u.nombre LIKE ? OR u.apellido LIKE ?)
      ORDER BY u.nombre ASC
    `, [`%${nombre}%`, `%${nombre}%`]);

    res.json(clientes);
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
};

// Ver detalle completo de un cliente
const obtenerDetalleCliente = async (req, res) => {
  const { id } = req.params;
  try {
    // Datos del cliente
    const [clientes] = await db.query(`
      SELECT u.id, u.nombre, u.apellido, u.correo, u.telefono,
             u.direccion, u.ciudad, u.creado_en, u.foto_perfil,
             s.puntos_actuales, s.kilos_totales
      FROM usuarios u
      LEFT JOIN saldo_cliente s ON u.id = s.usuario_id
      WHERE u.id = ? AND u.rol = 'cliente'
    `, [id]);

    if (clientes.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    // Últimos 5 registros de reciclaje
    const [reciclajes] = await db.query(`
      SELECT m.nombre AS material, r.kilos,
             r.kilos * t.puntos_por_kilo AS puntos_otorgados, r.fecha
      FROM registros_reciclaje r
      JOIN materiales m ON r.material_id = m.id
      JOIN tarifas_material t ON r.tarifa_id = t.id
      WHERE r.usuario_id = ?
      ORDER BY r.fecha DESC
      LIMIT 5
    `, [id]);

    // Últimos 5 canjes
    const [canjes] = await db.query(`
      SELECT p.nombre AS producto, c.puntos_descontados,
             c.estado, c.fecha_solicitud
      FROM canjes c
      JOIN productos p ON c.producto_id = p.id
      WHERE c.usuario_id = ?
      ORDER BY c.fecha_solicitud DESC
      LIMIT 5
    `, [id]);

    res.json({
      cliente: clientes[0],
      ultimos_reciclajes: reciclajes,
      ultimos_canjes: canjes
    });

  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
};

// Ver resumen general del sistema (dashboard)
const obtenerResumen = async (req, res) => {
  try {
    const [[totalClientes]] = await db.query(
      'SELECT COUNT(*) AS total FROM usuarios WHERE rol = "cliente"'
    );
    const [[totalKilos]] = await db.query(
      'SELECT SUM(kilos_totales) AS total FROM saldo_cliente'
    );
    const [[totalCanjes]] = await db.query(
      'SELECT COUNT(*) AS total FROM canjes'
    );
    const [[canjesPendientes]] = await db.query(
      'SELECT COUNT(*) AS total FROM canjes WHERE estado = "pendiente"'
    );
    const [[totalProductos]] = await db.query(
      'SELECT COUNT(*) AS total FROM productos WHERE activo = true'
    );
    const [configuracion] = await db.query(
      'SELECT clave, valor FROM configuracion'
    );

    res.json({
      total_clientes: totalClientes.total,
      total_kilos_reciclados: totalKilos.total || 0,
      total_canjes: totalCanjes.total,
      canjes_pendientes: canjesPendientes.total,
      total_productos_activos: totalProductos.total,
      configuracion: configuracion.reduce((acc, item) => {
        acc[item.clave] = item.valor;
        return acc;
      }, {})
    });

  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
};

// Actualizar configuración del sistema
const actualizarConfiguracion = async (req, res) => {
  const { clave, valor } = req.body;
  try {
    await db.query(
      'UPDATE configuracion SET valor = ? WHERE clave = ?',
      [valor, clave]
    );
    res.json({ mensaje: `Configuración "${clave}" actualizada correctamente` });
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
};

// Ver todos los canjes (no solo pendientes)
const obtenerTodosCanjes = async (req, res) => {
  const { estado } = req.query;
  try {
    let query = `
      SELECT c.id, u.nombre, u.apellido, u.telefono,
             p.nombre AS producto, c.puntos_descontados,
             c.estado, c.fecha_solicitud, c.fecha_entrega,
             d.calle AS direccion_entrega, d.referencia,
             d.telefono_contacto
      FROM canjes c
      JOIN usuarios u ON c.usuario_id = u.id
      JOIN productos p ON c.producto_id = p.id
      JOIN direcciones_entrega d ON c.direccion_entrega_id = d.id
    `;
    const params = [];

    if (estado) {
      query += ' WHERE c.estado = ?';
      params.push(estado);
    }

    query += ' ORDER BY c.fecha_solicitud DESC';

    const [canjes] = await db.query(query, params);
    res.json(canjes);
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
};

// Agregar puntos y kilos manualmente a un cliente
const agregarPuntosCliente = async (req, res) => {
  const { usuario_id, puntos, kilos } = req.body;
  const admin_id = req.usuario.id;

  console.log(`[AGREGAR PUNTOS] Admin ${admin_id} agregando ${puntos} puntos y ${kilos} kg al usuario ${usuario_id}`);

  try {
    // Verificar que el usuario existe
    const [usuario] = await db.query(
      'SELECT id FROM usuarios WHERE id = ? AND rol = "cliente"', [usuario_id]
    );
    if (usuario.length === 0) {
      console.log(`[AGREGAR PUNTOS ERROR] Cliente ${usuario_id} no encontrado`);
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    // Actualizar saldo del cliente
    await db.query(`
      UPDATE saldo_cliente 
      SET puntos_actuales = puntos_actuales + ?,
          kilos_totales = kilos_totales + ?
      WHERE usuario_id = ?
    `, [puntos || 0, kilos || 0, usuario_id]);

    console.log(`[AGREGAR PUNTOS OK] Actualizado usuario ${usuario_id}`);

    res.json({
      mensaje: `Se agregaron ${puntos || 0} puntos y ${kilos || 0} kg al cliente`,
      puntos_agregados: puntos || 0,
      kilos_agregados: kilos || 0
    });

  } catch (error) {
    console.log(`[AGREGAR PUNTOS ERROR]`, error.message);
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
};

module.exports = {
  obtenerClientes, buscarCliente, obtenerDetalleCliente,
  obtenerResumen, actualizarConfiguracion, obtenerTodosCanjes,
  agregarPuntosCliente
};