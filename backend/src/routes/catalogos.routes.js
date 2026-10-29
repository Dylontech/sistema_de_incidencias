/** Rutas de catálogos: municipios, zonas, tipos, usuarios y datos de apoyo. */
import { Router } from 'express';
import * as municipios from '../controllers/municipios.controller.js';
import * as tipos from '../controllers/tipos.controller.js';
import * as usuarios from '../controllers/usuarios.controller.js';
import {
  requiereAlgunaAdmin,
  requiereEmpleado,
  requierePermiso,
  requiereSesion
} from '../middlewares/auth.js';

const router = Router();

// Catálogos de presentación (iconos, ejemplos, límites): públicos.
router.get('/catalogos', municipios.catalogos);

router.get('/municipios', requiereSesion, municipios.listar);
// Debe ir antes de /municipios/:id para que «ubicacion» no se tome como id.
router.get('/municipios/ubicacion', requiereSesion, municipios.ubicacion);
router.get('/municipios/:id', requiereSesion, municipios.detalle);
router.get('/municipios/:id/zonas', requiereSesion, municipios.zonas);
router.get('/municipios/:id/colindantes', requiereSesion, municipios.colindantes);
router.get(
  '/municipios/:id/zonas/resumen',
  requiereEmpleado,
  requierePermiso('ver_zonas'),
  municipios.resumenZonas
);
router.get(
  '/municipios/:id/ficha',
  requiereEmpleado,
  requierePermiso('ver_municipios_panel'),
  municipios.ficha
);
router.put(
  '/municipios/:id/ficha',
  requiereEmpleado,
  requierePermiso('ver_municipios_panel'),
  municipios.guardarFicha
);
router.post('/municipios/:id/ficha/aprobar', requiereAlgunaAdmin, municipios.aprobarFicha);
router.post('/municipios/:id/ficha/rechazar', requiereAlgunaAdmin, municipios.rechazarFicha);
// El funcionario también necesita el resumen para ver la ficha de su municipio;
// el servicio recorta el catálogo a su alcance.
router.get(
  '/admin/municipios/resumen',
  requiereEmpleado,
  requierePermiso('ver_municipios_panel'),
  municipios.resumenPanel
);

router.get('/tipos', requiereSesion, tipos.listar);
router.post('/tipos', requiereEmpleado, requierePermiso('gestionar_tipos'), tipos.crear);
router.delete('/tipos/:id', requiereEmpleado, requierePermiso('gestionar_tipos'), tipos.eliminar);

router.get('/usuarios', requiereEmpleado, requierePermiso('ver_usuarios'), usuarios.listar);
// Las cuentas del personal las abre y mantiene un administrador. El servicio
// comprueba que un administrador territorial solo toque su ámbito.
router.post('/usuarios', requierePermiso('gestionar_usuarios'), usuarios.crear);
router.patch('/usuarios/:id', requierePermiso('gestionar_usuarios'), usuarios.actualizar);

export default router;
