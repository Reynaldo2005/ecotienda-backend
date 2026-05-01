const db = require('../config/db');

// Registrar kilos de reciclaje (solo admin)
const registrarReciclaje = async (req, res) => {
  const { usuario_id, material_id, kilos } = req.body;
  const admin_id = req.usuario.id;

  try {
    // Verificar que el usuario existe
    const [usuario] = await db.query(
      'SELECT id FROM usuarios WHERE id = ? AND rol = "cliente"', [usuario_id]
    );
    if (usuario.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    // Obtener la tarifa vigente del material
    const [tarifas] = await db.query(`
      SELECT id, puntos_por_kilo 
      FROM tarifas_material 
      WHERE material_id = ? 
      ORDER BY vigente_desde DESC 
      LIMIT 1
    `, [material_id]);

    if (tarifas.length === 0) {
      return res.status(404).json({ error: 'Material no encontrado o sin tarifa vigente' });
    }

    const tarifa = tarifas[0];
    const puntos_otorgados = Math.round(kilos * tarifa.puntos_por_kilo);

    // Registrar el reciclaje
    const [resultado] = await db.query(`
      INSERT INTO registros_reciclaje 
        (usuario_id, material_id, admin_id, tarifa_id, kilos, observacion)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [usuario_id, material_id, admin_id, tarifa.id, kilos, `${kilos} kg de material registrados`]);

    // Actualizar saldo del cliente
    await db.query(`
      UPDATE saldo_cliente 
      SET puntos_actuales = puntos_actuales + ?,
          kilos_totales = kilos_totales + ?
      WHERE usuario_id = ?
    `, [puntos_otorgados, kilos, usuario_id]);

    // Registrar en historial de puntos
    await db.query(`
      INSERT INTO historial_puntos (usuario_id, puntos_cambio, tipo, referencia_id)
      VALUES (?, ?, 'ingreso', ?)
    `, [usuario_id, puntos_otorgados, resultado.insertId]);

    // Verificar si alcanzó el umbral de oferta especial
    const [saldo] = await db.query(
      'SELECT kilos_totales FROM saldo_cliente WHERE usuario_id = ?', [usuario_id]
    );
    const [config] = await db.query(
      'SELECT valor FROM configuracion WHERE clave = "umbral_kilos_oferta"'
    );
    const umbral = parseFloat(config[0].valor);
    const ofertaEspecial = saldo[0].kilos_totales >= umbral;

    res.status(201).json({
      mensaje: 'Reciclaje registrado correctamente',
      kilos_registrados: kilos,
      puntos_otorgados,
      oferta_especial: ofertaEspecial
        ? '🎉 El cliente ha alcanzado el umbral para una oferta especial'
        : null
    });

  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
};

// Ver historial de reciclaje de un cliente (admin)
const obtenerHistorialReciclaje = async (req, res) => {
  const { usuario_id } = req.params;
  try {
    const [registros] = await db.query(`
      SELECT r.id, m.nombre AS material, r.kilos,
             t.puntos_por_kilo, r.kilos * t.puntos_por_kilo AS puntos_otorgados,
             r.fecha, r.observacion
      FROM registros_reciclaje r
      JOIN materiales m ON r.material_id = m.id
      JOIN tarifas_material t ON r.tarifa_id = t.id
      WHERE r.usuario_id = ?
      ORDER BY r.fecha DESC
    `, [usuario_id]);

    res.json(registros);
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
};

// Ver saldo actual del cliente
const obtenerSaldo = async (req, res) => {
  const usuario_id = req.usuario.id;
  try {
    const [saldo] = await db.query(`
      SELECT s.puntos_actuales, s.kilos_totales,
             u.nombre, u.apellido
      FROM saldo_cliente s
      JOIN usuarios u ON s.usuario_id = u.id
      WHERE s.usuario_id = ?
    `, [usuario_id]);

    if (saldo.length === 0) {
      return res.status(404).json({ error: 'Saldo no encontrado' });
    }

    res.json(saldo[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
};

// Ver historial de puntos del cliente
const obtenerHistorialPuntos = async (req, res) => {
  const usuario_id = req.usuario.id;
  try {
    const [historial] = await db.query(`
      SELECT id, puntos_cambio, tipo, referencia_id, fecha
      FROM historial_puntos
      WHERE usuario_id = ?
      ORDER BY fecha DESC
    `, [usuario_id]);

    res.json(historial);
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
};

module.exports = { registrarReciclaje, obtenerHistorialReciclaje, obtenerSaldo, obtenerHistorialPuntos };