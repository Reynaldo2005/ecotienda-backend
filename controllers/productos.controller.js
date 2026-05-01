const db = require('../config/db');

// Ver todos los productos activos (para clientes)
const obtenerProductos = async (req, res) => {
  try {
    const [productos] = await db.query(`
      SELECT p.id, p.nombre, p.descripcion, p.imagen_url, 
             p.costo_puntos, p.stock, c.nombre AS categoria
      FROM productos p
      JOIN categorias_producto c ON p.categoria_id = c.id
      WHERE p.activo = true
      ORDER BY c.nombre, p.nombre
    `);
    res.json(productos);
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
};

// Ver un producto por ID
const obtenerProductoPorId = async (req, res) => {
  const { id } = req.params;
  try {
    const [productos] = await db.query(`
      SELECT p.id, p.nombre, p.descripcion, p.imagen_url,
             p.costo_puntos, p.stock, c.nombre AS categoria
      FROM productos p
      JOIN categorias_producto c ON p.categoria_id = c.id
      WHERE p.id = ? AND p.activo = true
    `, [id]);

    if (productos.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    res.json(productos[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
};

// Crear producto (solo admin)
const crearProducto = async (req, res) => {
  const { categoria_id, nombre, descripcion, imagen_url, costo_puntos, stock } = req.body;
  try {
    const [resultado] = await db.query(`
      INSERT INTO productos (categoria_id, nombre, descripcion, imagen_url, costo_puntos, stock)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [categoria_id, nombre, descripcion, imagen_url, costo_puntos, stock]);

    res.status(201).json({ mensaje: 'Producto creado correctamente', id: resultado.insertId });
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
};

// Editar producto (solo admin)
const editarProducto = async (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion, imagen_url, costo_puntos, stock, activo } = req.body;
  try {
    await db.query(`
      UPDATE productos 
      SET nombre = ?, descripcion = ?, imagen_url = ?, 
          costo_puntos = ?, stock = ?, activo = ?
      WHERE id = ?
    `, [nombre, descripcion, imagen_url, costo_puntos, stock, activo, id]);

    res.json({ mensaje: 'Producto actualizado correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
};

// Eliminar producto (solo admin)
const eliminarProducto = async (req, res) => {
  const { id } = req.params;
  try {
    // No eliminamos físicamente, solo desactivamos
    await db.query('UPDATE productos SET activo = false WHERE id = ?', [id]);
    res.json({ mensaje: 'Producto desactivado correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
};

module.exports = { obtenerProductos, obtenerProductoPorId, crearProducto, editarProducto, eliminarProducto };