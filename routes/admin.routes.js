const express = require('express');
const router = express.Router();
const {
  obtenerClientes, buscarCliente, obtenerDetalleCliente,
  obtenerResumen, actualizarConfiguracion, obtenerTodosCanjes,
  agregarPuntosCliente
} = require('../controllers/admin.controller');
const { verificarToken, verificarAdmin } = require('../middlewares/auth.middleware');
const db = require('../config/db');

// Logging middleware para debug
router.use((req, res, next) => {
  console.log(`[ADMIN ROUTES] ${req.method} ${req.path}`);
  console.log(`[HEADERS] Authorization:`, req.headers['authorization']?.substring(0, 20) + '...');
  next();
});

// Todas las rutas del admin requieren token y rol admin
router.use(verificarToken, verificarAdmin);

// Dashboard
router.get('/resumen', obtenerResumen);

// Clientes
router.get('/clientes', obtenerClientes);
router.get('/clientes/buscar', buscarCliente);
router.get('/clientes/:id', obtenerDetalleCliente);
router.post('/clientes/puntos', agregarPuntosCliente);

// Canjes
router.get('/canjes', obtenerTodosCanjes);

// Configuración
router.put('/configuracion', actualizarConfiguracion);

// Eliminar cliente 
router.delete('/clientes/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [usuario] = await db.query(
      'SELECT id, rol FROM usuarios WHERE id = ?', [id]
    );
    if (usuario.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    if (usuario[0].rol === 'admin') {
      return res.status(400).json({ error: 'No se puede eliminar al administrador' });
    }
    await db.query('DELETE FROM saldo_cliente WHERE usuario_id = ?', [id]);
    await db.query('DELETE FROM historial_puntos WHERE usuario_id = ?', [id]);
    await db.query('DELETE FROM direcciones_entrega WHERE usuario_id = ?', [id]);
    await db.query('DELETE FROM usuarios WHERE id = ?', [id]);
    res.json({ mensaje: 'Usuario eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
});

module.exports = router;