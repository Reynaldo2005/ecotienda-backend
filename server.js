const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());
const path = require('path');

// Servir imágenes estáticas
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Logging middleware global
app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.path}`);
  next();
});

// Ruta pública para materiales
// Ruta pública para materiales
app.get('/api/materiales', async (req, res) => {
  try {
    const db = require('./config/db');
    const [materiales] = await db.query(`
      SELECT m.id, m.nombre, t.puntos_por_kilo
      FROM materiales m
      JOIN tarifas_material t ON t.material_id = m.id
      WHERE t.vigente_desde = (
        SELECT MAX(vigente_desde) 
        FROM tarifas_material 
        WHERE material_id = m.id
      )
      ORDER BY m.nombre ASC
    `);
    res.json(materiales);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rutas
const authRoutes = require('./routes/auth.routes');
app.use('/api/auth', authRoutes);
const productosRoutes = require('./routes/productos.routes');
app.use('/api/productos', productosRoutes);
const reciclajeRoutes = require('./routes/reciclaje.routes');
app.use('/api/reciclaje', reciclajeRoutes);
const canjesRoutes = require('./routes/canjes.routes');
app.use('/api/canjes', canjesRoutes);
const adminRoutes = require('./routes/admin.routes');
app.use('/api/admin', adminRoutes);
const ofertasRoutes = require('./routes/ofertas.routes');
app.use('/api/ofertas', ofertasRoutes);

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ mensaje: 'EcoTienda API funcionando correctamente' });
});

// 404 handler
app.use((req, res) => {
  console.log(`[404] No route found for ${req.method} ${req.path}`);
  res.status(404).json({ 
    error: 'Ruta no encontrada',
    path: req.path,
    method: req.method
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});