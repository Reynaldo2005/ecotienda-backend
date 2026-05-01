const express = require('express');
const router = express.Router();
const { registrarReciclaje, obtenerHistorialReciclaje, obtenerSaldo, obtenerHistorialPuntos } = require('../controllers/reciclaje.controller');
const { verificarToken, verificarAdmin } = require('../middlewares/auth.middleware');
const db = require('../config/db');

// Solo admin puede registrar reciclaje y ver historial por cliente
router.post('/', verificarToken, verificarAdmin, registrarReciclaje);
router.get('/historial/:usuario_id', verificarToken, verificarAdmin, obtenerHistorialReciclaje);

// El cliente puede ver su propio saldo e historial
router.get('/saldo', verificarToken, obtenerSaldo);
router.get('/historial', verificarToken, obtenerHistorialPuntos);

//Obtener la dirección principal del cliente
router.get('/mi-direccion', verificarToken, async (req, res) => {
  try {
    const [direcciones] = await db.query(
      'SELECT id FROM direcciones_entrega WHERE usuario_id = ? AND es_principal = true LIMIT 1',
      [req.usuario.id]
    );
    if (direcciones.length === 0) {
      return res.status(404).json({ error: 'No tienes dirección registrada' });
    }
    res.json({ direccion_id: direcciones[0].id });
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
});

// Registrar reciclaje manual con puntos fijos (admin)
router.post('/manual', verificarToken, verificarAdmin, async (req, res) => {
  const { usuario_id, kilos, puntos } = req.body;
  const admin_id = req.usuario.id;

  try {
    // Verificar que el cliente existe
    const [usuario] = await db.query(
      'SELECT id FROM usuarios WHERE id = ? AND rol = "cliente"', [usuario_id]
    );
    if (usuario.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    // Actualizar saldo del cliente
    await db.query(`
      UPDATE saldo_cliente 
      SET puntos_actuales = puntos_actuales + ?,
          kilos_totales = kilos_totales + ?
      WHERE usuario_id = ?
    `, [puntos, kilos, usuario_id]);

    // Registrar en historial de puntos
    await db.query(`
      INSERT INTO historial_puntos (usuario_id, puntos_cambio, tipo, referencia_id)
      VALUES (?, ?, 'ingreso', ?)
    `, [usuario_id, puntos, admin_id]);

    // Verificar umbral de oferta especial
    const [saldo] = await db.query(
      'SELECT kilos_totales FROM saldo_cliente WHERE usuario_id = ?', [usuario_id]
    );
    const [config] = await db.query(
      'SELECT valor FROM configuracion WHERE clave = "umbral_kilos_oferta"'
    );
    const umbral = parseFloat(config[0].valor);
    const ofertaEspecial = parseFloat(saldo[0].kilos_totales) >= umbral;

    res.status(201).json({
      mensaje: 'Reciclaje registrado correctamente',
      kilos_registrados: kilos,
      puntos_otorgados: puntos,
      oferta_especial: ofertaEspecial
        ? '🎉 El cliente ha alcanzado el umbral para una oferta especial'
        : null
    });

  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
});

module.exports = router;