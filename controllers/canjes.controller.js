const db = require('../config/db');

// Solicitar un canje (cliente)
const solicitarCanje = async (req, res) => {
  const usuario_id = req.usuario.id;
  const { producto_id, direccion_entrega_id } = req.body;

  try {
    // Verificar que el producto existe y tiene stock
    const [productos] = await db.query(
      'SELECT id, nombre, costo_puntos, stock FROM productos WHERE id = ? AND activo = true',
      [producto_id]
    );
    if (productos.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const producto = productos[0];

    if (producto.stock <= 0) {
      return res.status(400).json({ error: 'Producto sin stock disponible' });
    }

    // Verificar que el cliente tiene suficientes puntos
    const [saldo] = await db.query(
      'SELECT puntos_actuales FROM saldo_cliente WHERE usuario_id = ?',
      [usuario_id]
    );
    if (saldo.length === 0 || saldo[0].puntos_actuales < producto.costo_puntos) {
      return res.status(400).json({ error: 'Puntos insuficientes para realizar el canje' });
    }

    // Verificar que la dirección pertenece al cliente
    const [direccion] = await db.query(
      'SELECT id FROM direcciones_entrega WHERE id = ? AND usuario_id = ?',
      [direccion_entrega_id, usuario_id]
    );
    if (direccion.length === 0) {
      return res.status(404).json({ error: 'Dirección de entrega no encontrada' });
    }

    // Crear el canje
    const [resultado] = await db.query(`
      INSERT INTO canjes (usuario_id, producto_id, direccion_entrega_id, puntos_descontados, estado)
      VALUES (?, ?, ?, ?, 'pendiente')
    `, [usuario_id, producto_id, direccion_entrega_id, producto.costo_puntos]);

    // Descontar puntos del cliente
    await db.query(`
      UPDATE saldo_cliente 
      SET puntos_actuales = puntos_actuales - ?
      WHERE usuario_id = ?
    `, [producto.costo_puntos, usuario_id]);

    // Reducir stock del producto
    await db.query(
      'UPDATE productos SET stock = stock - 1 WHERE id = ?',
      [producto_id]
    );

    // Registrar en historial de puntos
    await db.query(`
      INSERT INTO historial_puntos (usuario_id, puntos_cambio, tipo, referencia_id)
      VALUES (?, ?, 'descuento', ?)
    `, [usuario_id, -producto.costo_puntos, resultado.insertId]);

    res.status(201).json({
      mensaje: 'Canje solicitado correctamente',
      canje_id: resultado.insertId,
      producto: producto.nombre,
      puntos_descontados: producto.costo_puntos
    });

  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
};

// Ver canjes del cliente (con progreso y barra)
const obtenerMisCanjes = async (req, res) => {
  const usuario_id = req.usuario.id;
  try {
    const [canjes] = await db.query(`
      SELECT c.id, p.nombre AS producto, p.imagen_url,
             c.puntos_descontados, c.estado,
             c.fecha_solicitud, c.fecha_empaquetado, c.fecha_envio, c.fecha_entrega,
             d.calle AS direccion_entrega
      FROM canjes c
      JOIN productos p ON c.producto_id = p.id
      JOIN direcciones_entrega d ON c.direccion_entrega_id = d.id
      WHERE c.usuario_id = ?
      ORDER BY c.fecha_solicitud DESC
    `, [usuario_id]);

    // Agregar progreso y mensajes a cada canje
    const canjesConProgreso = canjes.map(canje => {
      const calcularProgreso = (estado) => {
        const porcentajes = {
          pendiente: 0,
          empaquetado: 33,
          en_camino: 66,
          entregado: 100
        };
        return porcentajes[estado] || 0;
      };

      const calcularMensaje = (estado) => {
        const mensajes = {
          pendiente: 'Pendiente de procesamiento',
          empaquetado: '📦 Tu producto está siendo empaquetado',
          en_camino: '🚚 Tu producto está en camino a tu puerta',
          entregado: '✅ ¡Tu producto ha sido entregado!'
        };
        return mensajes[estado] || 'Estado desconocido';
      };

      return {
        ...canje,
        progreso: calcularProgreso(canje.estado),
        mensaje_estado: calcularMensaje(canje.estado)
      };
    });

    res.json(canjesConProgreso);
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
};

// Ver todos los canjes pendientes (admin)
const obtenerCanjesPendientes = async (req, res) => {
  try {
    const [canjes] = await db.query(`
      SELECT c.id, u.nombre, u.apellido, u.telefono,
             p.nombre AS producto, p.imagen_url,
             c.puntos_descontados, c.estado,
             c.fecha_solicitud, d.calle AS direccion_entrega,
             d.referencia, d.telefono_contacto
      FROM canjes c
      JOIN usuarios u ON c.usuario_id = u.id
      JOIN productos p ON c.producto_id = p.id
      JOIN direcciones_entrega d ON c.direccion_entrega_id = d.id
      WHERE c.estado = 'pendiente'
      ORDER BY c.fecha_solicitud ASC
    `);

    res.json(canjes);
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
};

// Cambiar estado del canje (admin) - pendiente → empaquetado → en_camino → entregado
const cambiarEstado = async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;

  // Estados válidos y su orden
  const estadosValidos = ['pendiente', 'empaquetado', 'en_camino', 'entregado'];
  const estadosOrden = { pendiente: 0, empaquetado: 1, en_camino: 2, entregado: 3 };

  if (!estadosValidos.includes(estado)) {
    return res.status(400).json({ error: 'Estado inválido. Estados válidos: ' + estadosValidos.join(', ') });
  }

  try {
    // Obtener estado actual
    const [canje] = await db.query(
      'SELECT id, estado FROM canjes WHERE id = ?', [id]
    );
    
    if (canje.length === 0) {
      return res.status(404).json({ error: 'Canje no encontrado' });
    }

    const estadoActual = canje[0].estado;

    // Validar transición válida (no ir hacia atrás ni al mismo estado)
    if (estadosOrden[estado] <= estadosOrden[estadoActual]) {
      return res.status(400).json({ 
        error: `No puedes pasar de "${estadoActual}" a "${estado}". Solo puedes avanzar de forma lineal.` 
      });
    }

    // Mapeo de columnas de fecha según estado
    const columnaFecha = {
      empaquetado: 'fecha_empaquetado',
      en_camino: 'fecha_envio',
      entregado: 'fecha_entrega'
    }[estado];

    // Construir query dinámica
    let query = `UPDATE canjes SET estado = ?`;
    const params = [estado];

    if (columnaFecha) {
      query += `, ${columnaFecha} = CURRENT_TIMESTAMP`;
    }

    query += ` WHERE id = ?`;
    params.push(id);

    await db.query(query, params);

    // Mensajes bonitos según estado
    const mensajes = {
      empaquetado: '📦 Pedido en proceso de empaquetado',
      en_camino: '🚚 Pedido en camino a su destino',
      entregado: '✅ Pedido entregado correctamente'
    };

    res.json({ 
      mensaje: mensajes[estado],
      canje_id: id,
      estado_anterior: estadoActual,
      estado_actual: estado,
      progreso: { pendiente: 0, empaquetado: 33, en_camino: 66, entregado: 100 }[estado]
    });

  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
};

// Cancelar canje y devolver puntos (admin)
const cancelarCanje = async (req, res) => {
  const { id } = req.params;
  try {
    const [canjes] = await db.query(
      'SELECT id, usuario_id, producto_id, puntos_descontados, estado FROM canjes WHERE id = ?',
      [id]
    );
    if (canjes.length === 0) {
      return res.status(404).json({ error: 'Canje no encontrado' });
    }

    const canje = canjes[0];

    if (canje.estado !== 'pendiente') {
      return res.status(400).json({ error: 'Solo se pueden cancelar canjes pendientes' });
    }

    // Cancelar el canje
    await db.query(
      'UPDATE canjes SET estado = "cancelado" WHERE id = ?', [id]
    );

    // Devolver puntos al cliente
    await db.query(`
      UPDATE saldo_cliente 
      SET puntos_actuales = puntos_actuales + ?
      WHERE usuario_id = ?
    `, [canje.puntos_descontados, canje.usuario_id]);

    // Devolver stock al producto
    await db.query(
      'UPDATE productos SET stock = stock + 1 WHERE id = ?',
      [canje.producto_id]
    );

    // Registrar devolución en historial
    await db.query(`
      INSERT INTO historial_puntos (usuario_id, puntos_cambio, tipo, referencia_id)
      VALUES (?, ?, 'ingreso', ?)
    `, [canje.usuario_id, canje.puntos_descontados, id]);

    res.json({ mensaje: 'Canje cancelado y puntos devueltos correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
};

module.exports = { solicitarCanje, obtenerMisCanjes, obtenerCanjesPendientes, cambiarEstado, cancelarCanje };