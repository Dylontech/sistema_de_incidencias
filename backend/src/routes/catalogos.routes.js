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
router.post('/tipos', requiereEmpleado, requierePermiso('crear_tipos'), tipos.crear);
router.delete('/tipos/:id', requiereEmpleado, requierePermiso('eliminar_tipos'), tipos.eliminar);

router.get('/usuarios', requiereEmpleado, requierePermiso('ver_usuarios'), usuarios.listar);
// Las cuentas del personal las abre y mantiene un administrador. El servicio
// comprueba que un administrador territorial solo toque su ámbito. Los
// permisos CRUD permiten separar consulta, alta, edición y baja.
router.post('/usuarios', requierePermiso('crear_usuarios'), usuarios.crear);
router.patch('/usuarios/:id', requierePermiso('editar_usuarios'), usuarios.actualizar);
router.delete('/usuarios/:id', requierePermiso('eliminar_usuarios'), usuarios.eliminar);
// Reactivar una cuenta dada de baja conserva su historial y su territorio.
router.post(
  '/usuarios/:id/reactivar',
  requierePermiso('editar_usuarios'),
  usuarios.reactivar
);
// Contraseña consultable: solo la administración y con registro en auditoría.
router.get(
  '/usuarios/:id/password',
  requiereEmpleado,
  requierePermiso('revelar_password_usuarios'),
  usuarios.revelarPassword
);
router.post(
  '/usuarios/:id/password/restablecer',
  requiereEmpleado,
  requierePermiso('revelar_password_usuarios'),
  usuarios.restablecerPassword
);

export default router;
