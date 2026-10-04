/**
 * Single source of truth for all user-facing copy (es-MX).
 * No screen should hardcode UI text — import `t` from `src/i18n` instead.
 */
const es = {
  common: {
    appName: 'VecinoSeguro',
    loading: 'Cargando…',
    retry: 'Reintentar',
    cancel: 'Cancelar',
    save: 'Guardar',
    confirm: 'Confirmar',
    close: 'Cerrar',
    ok: 'Entendido',
    error: 'Ocurrió un error',
    unknownError: 'Algo salió mal. Inténtalo de nuevo.',
    offline: 'Sin conexión a internet.',
    offlineHint: 'Revisa tu conexión Wi-Fi o datos móviles e inténtalo de nuevo.',
    requiredField: 'Este campo es obligatorio.',
    yes: 'Sí',
    no: 'No',
    back: 'Regresar',
  },

  roles: {
    neighbor: 'Vecino',
    admin: 'Administrador',
  },

  status: {
    pending: 'Pendiente',
    active: 'Activo',
    blocked: 'Bloqueado',
  },

  nav: {
    cameras: 'Cámaras',
    gate: 'Portón',
    activity: 'Actividad',
    neighbors: 'Vecinos',
    profile: 'Perfil',
  },

  auth: {
    login: {
      title: 'Iniciar sesión',
      subtitle: 'Bienvenido de vuelta a tu comunidad.',
      emailLabel: 'Correo electrónico',
      emailPlaceholder: 'tu@correo.com',
      passwordLabel: 'Contraseña',
      passwordPlaceholder: 'Tu contraseña',
      submit: 'Iniciar sesión',
      submitting: 'Iniciando sesión…',
      noAccount: '¿Aún no tienes cuenta?',
      goToSignup: 'Regístrate',
      invalidCredentials: 'Correo o contraseña incorrectos.',
      genericError: 'No se pudo iniciar sesión. Inténtalo de nuevo.',
    },
    signup: {
      title: 'Crear cuenta',
      subtitle: 'Solicita acceso a la comunidad de tu fraccionamiento.',
      fullNameLabel: 'Nombre completo',
      fullNamePlaceholder: 'Tu nombre y apellidos',
      phoneLabel: 'Teléfono (opcional)',
      phonePlaceholder: '81 0000 0000',
      emailLabel: 'Correo electrónico',
      emailPlaceholder: 'tu@correo.com',
      passwordLabel: 'Contraseña',
      passwordPlaceholder: 'Crea una contraseña',
      passwordHint: 'Mínimo 8 caracteres.',
      submit: 'Crear cuenta',
      submitting: 'Creando cuenta…',
      haveAccount: '¿Ya tienes cuenta?',
      goToLogin: 'Inicia sesión',
      genericError: 'No se pudo crear la cuenta. Inténtalo de nuevo.',
      emailInUse: 'Ese correo ya está registrado.',
      weakPassword: 'La contraseña es demasiado corta.',
    },
    pendingApproval: {
      title: 'Cuenta en revisión',
      message:
        'Tu cuenta fue creada correctamente. Un administrador de tu fraccionamiento debe aprobar tu acceso antes de que puedas continuar.',
      hint: 'Esto normalmente toma poco tiempo. Vuelve a intentar iniciar sesión más tarde.',
      refresh: 'Actualizar estado',
      signOut: 'Cerrar sesión',
    },
    blocked: {
      title: 'Acceso bloqueado',
      message:
        'Un administrador ha bloqueado el acceso de tu cuenta a VecinoSeguro. Si crees que esto es un error, contacta a la administración de tu fraccionamiento.',
      signOut: 'Cerrar sesión',
    },
  },

  cameras: {
    title: 'Cámaras',
    empty: 'Todavía no hay cámaras configuradas.',
    loadError: 'No se pudieron cargar las cámaras.',
    streamLoadError: 'No se pudo cargar la transmisión en vivo.',
    streamLoading: 'Conectando con la cámara…',
    liveLabel: 'EN VIVO',
    disabledLabel: 'Fuera de servicio',
    noVideoAccess: 'Sin acceso al video',
    noVideoAccessMessage:
      'No se pudo obtener acceso de video para tu cuenta. Si el problema continúa, contacta a la administración.',
  },

  gate: {
    title: 'Portón',
    openButton: 'Abrir portón',
    opening: 'Abriendo…',
    acceptedTitle: 'Solicitud enviada',
    acceptedMessage: 'El portón está recibiendo la señal para abrirse.',
    lastOpened: 'Última apertura',
    lastOpenedBy: 'por {{name}}',
    never: 'Sin registros todavía',
    rateLimitedTitle: 'Espera un momento',
    rateLimitedMessage: 'Ya se envió una solicitud. Intenta de nuevo en {{seconds}} s.',
    notActiveTitle: 'Cuenta no activa',
    notActiveMessage: 'Tu cuenta debe estar activa para abrir el portón.',
    unauthorizedTitle: 'No autorizado',
    unauthorizedMessage: 'Tu sesión no tiene permiso para esta acción. Vuelve a iniciar sesión.',
    genericErrorTitle: 'No se pudo abrir el portón',
    genericErrorMessage: 'Ocurrió un problema al enviar la solicitud. Inténtalo de nuevo.',
    offlineMessage: 'Sin conexión. No se pudo abrir el portón.',
  },

  activity: {
    title: 'Actividad',
    empty: 'Todavía no hay eventos registrados.',
    loadError: 'No se pudo cargar el registro de actividad.',
    resultSuccess: 'Exitoso',
    resultFailed: 'Falló',
    sourceApp: 'App',
    sourcePi: 'Portón',
    sourceSystem: 'Sistema',
    actionOpen: 'Apertura de portón',
    unknownActor: 'Sistema',
  },

  neighbors: {
    title: 'Vecinos',
    empty: 'No hay vecinos registrados todavía.',
    loadError: 'No se pudo cargar la lista de vecinos.',
    inviteButton: 'Invitar vecino',
    inviteTitle: 'Invitar vecino',
    inviteEmailLabel: 'Correo electrónico',
    inviteEmailPlaceholder: 'vecino@correo.com',
    inviteRoleLabel: 'Rol',
    inviteSend: 'Enviar invitación',
    inviteSuccess: 'Invitación enviada.',
    inviteError: 'No se pudo enviar la invitación.',
    approve: 'Aprobar',
    block: 'Bloquear',
    unblock: 'Desbloquear',
    remove: 'Eliminar',
    makeAdmin: 'Hacer administrador',
    makeNeighbor: 'Quitar como administrador',
    confirmRemoveTitle: 'Eliminar vecino',
    confirmRemoveMessage: '¿Seguro que deseas eliminar a {{name}} de la comunidad?',
    confirmBlockTitle: 'Bloquear acceso',
    confirmBlockMessage: '¿Seguro que deseas bloquear a {{name}}?',
    actionError: 'No se pudo completar la acción.',
    actionSuccess: 'Cambios guardados.',
  },

  profile: {
    title: 'Perfil',
    settingsTitle: 'Ajustes',
    languageLabel: 'Idioma',
    languageValue: 'Español (México)',
    signOut: 'Cerrar sesión',
    signOutConfirmTitle: 'Cerrar sesión',
    signOutConfirmMessage: '¿Seguro que deseas cerrar tu sesión?',
    privacyNotice: 'Aviso de privacidad',
    appVersion: 'Versión {{version}}',
    household: 'Vivienda',
    householdUnset: 'Sin asignar',
    roleLabel: 'Rol',
    statusLabel: 'Estado',
  },

  privacy: {
    title: 'Aviso de Privacidad',
    body:
      'VecinoSeguro (el "Fraccionamiento"), con domicilio en Santa Catarina, Nuevo León, México, ' +
      'es responsable del tratamiento de tus datos personales conforme a la Ley Federal de Protección ' +
      'de Datos Personales en Posesión de los Particulares (LFPDPPP).\n\n' +
      'Datos que recabamos: nombre completo, teléfono, correo electrónico, vivienda asignada y ' +
      'registros de uso del portón (fecha, hora y usuario) con fines de seguridad de la comunidad.\n\n' +
      'Finalidad: gestionar tu acceso a la aplicación, verificar tu identidad como residente, ' +
      'permitir la apertura remota del portón y mantener un registro de auditoría de seguridad.\n\n' +
      'No compartimos tus datos personales con terceros ajenos a la administración del fraccionamiento, ' +
      'salvo requerimiento de autoridad competente.\n\n' +
      'Derechos ARCO: puedes solicitar acceso, rectificación, cancelación u oposición al tratamiento de ' +
      'tus datos personales contactando a la administración de tu fraccionamiento.\n\n' +
      'Este es un aviso de privacidad simplificado. Solicita el aviso de privacidad integral a la ' +
      'administración de tu comunidad.',
    close: 'Cerrar',
  },

  errors: {
    networkTitle: 'Sin conexión',
    networkMessage: 'No se pudo conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.',
    sessionExpired: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  },
} as const;

export default es;
export type Translations = typeof es;
