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
      checkEmail:
        'Te enviamos un correo para confirmar tu cuenta. Revisa tu bandeja de entrada y luego inicia sesión.',
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
    loading: 'Cargando cámaras…',
    countOne: '1 cámara',
    countMany: '{{count}} cámaras',
    empty: 'Aún no hay cámaras',
    emptyHint: 'Cuando el administrador las agregue, aparecerán aquí.',
    loadError: 'No se pudieron cargar las cámaras.',
    streamLoadError: 'No se pudo cargar la transmisión en vivo.',
    streamLoading: 'Conectando con la cámara…',
    liveLabel: 'EN VIVO',
    connecting: 'Conectando…',
    noSignal: 'Sin señal',
    disabledLabel: 'Fuera de servicio',
    openFullscreen: 'Toca para verla en pantalla completa',
    noVideoAccess: 'Sin acceso al video',
    noVideoAccessMessage:
      'Tu cuenta no tiene acceso al video en este momento. Si el problema continúa, contacta al administrador de tu comunidad.',
    videoErrorTitle: 'No se pudo conectar con el video',
    videoErrorMessage: 'Revisa tu internet e inténtalo de nuevo.',
  },

  gate: {
    title: 'Portón',
    openButton: 'Abrir portón',
    opening: 'Abriendo…',
    openingHint: 'Enviando la solicitud',
    acceptedTitle: 'Abriendo el portón',
    acceptedMessage: 'Espera unos segundos antes de pasar.',
    lastOpened: 'Última apertura',
    lastOpenedBy: 'por {{name}}',
    never: 'Aún no has abierto el portón',
    todayAt: 'hoy, {{time}}',
    yesterdayAt: 'ayer, {{time}}',
    rateLimitedTitle: 'Espera {{seconds}} s',
    rateLimitedMessage: 'Acabas de enviar una solicitud.',
    notActiveTitle: 'Cuenta no activa',
    notActiveMessage: 'Tu cuenta no está activa. Contacta al administrador de tu comunidad.',
    unauthorizedTitle: 'Inicia sesión de nuevo',
    unauthorizedMessage: 'Tu sesión venció. Toca aquí para volver a entrar.',
    genericErrorTitle: 'No se pudo abrir',
    genericErrorMessage: 'Algo salió mal. Toca aquí para intentarlo de nuevo.',
    offlineTitle: 'Sin conexión',
    offlineMessage: 'Revisa tu internet. Toca aquí para intentarlo de nuevo.',
  },

  activity: {
    title: 'Actividad',
    loading: 'Cargando actividad…',
    empty: 'Aún no hay actividad',
    emptyHint: 'Cada vez que alguien abra el portón, quedará registrado aquí.',
    loadError: 'No se pudo cargar el registro de actividad.',
    refreshError: 'No se pudo actualizar. Estás viendo la última lista cargada.',
    summaryNone: 'Hoy no ha habido aperturas',
    openingsOne: '1 apertura hoy',
    openingsMany: '{{count}} aperturas hoy',
    failedOne: '1 fallida',
    failedMany: '{{count}} fallidas',
    today: 'Hoy',
    yesterday: 'Ayer',
    resultSuccess: 'Exitoso',
    resultFailed: 'Falló',
    appRequested: 'Pidió abrir el portón',
    appRequestedFailed: 'Intentó abrir el portón',
    piSuccess: 'El portón se abrió',
    piFailed: 'El portón no respondió',
    systemEvent: 'Evento automático del sistema',
    actorGate: 'Portón',
    actorSystem: 'Sistema',
    actorRemoved: 'Usuario eliminado',
    limitNote: 'Se muestran los últimos {{count}} eventos.',
  },

  neighbors: {
    title: 'Vecinos',
    loading: 'Cargando vecinos…',
    loadError: 'No se pudo cargar la lista de vecinos.',
    refreshError: 'No se pudo actualizar. Estás viendo la última lista cargada.',
    filterPending: 'Pendientes',
    filterActive: 'Activos',
    filterBlocked: 'Bloqueados',
    emptyPending: 'No hay solicitudes pendientes',
    emptyPendingHint: 'Cuando alguien se registre, aparecerá aquí para que lo apruebes.',
    emptyActive: 'Aún no hay vecinos activos',
    emptyActiveHint: 'Aprueba una solicitud o invita a un vecino.',
    emptyBlocked: 'No hay vecinos bloqueados',
    emptySearch: 'Sin resultados para "{{query}}"',
    searchPlaceholder: 'Buscar por nombre',
    you: 'Tú',
    noName: 'Sin nombre',
    noHousehold: 'Sin vivienda',
    moreActions: 'Más acciones para {{name}}',
    inviteButton: 'Invitar vecino',
    inviteTitle: 'Invitar vecino',
    inviteEmailLabel: 'Correo electrónico',
    inviteEmailPlaceholder: 'vecino@correo.com',
    inviteRoleLabel: 'Rol',
    inviteSend: 'Enviar invitación',
    inviteSuccess: 'Invitación enviada.',
    inviteError: 'No se pudo enviar la invitación. Inténtalo de nuevo.',
    inviteInvalidEmail: 'Escribe un correo válido, por ejemplo vecino@correo.com.',
    approve: 'Aprobar acceso',
    block: 'Bloquear acceso',
    unblock: 'Desbloquear',
    remove: 'Eliminar de la comunidad',
    makeAdmin: 'Hacer administrador',
    makeNeighbor: 'Quitar como administrador',
    confirmRemoveTitle: 'Eliminar de la comunidad',
    confirmRemoveMessage:
      '{{name}} perderá el acceso al portón y a las cámaras, y se le quitará su vivienda. Su historial de aperturas se conserva.',
    confirmBlockTitle: 'Bloquear acceso',
    confirmBlockMessage:
      '{{name}} perderá el acceso al portón y a las cámaras de inmediato. Puedes desbloquearlo después.',
    confirmMakeAdminTitle: 'Hacer administrador',
    confirmMakeAdminMessage: '{{name}} podrá aprobar, bloquear y eliminar vecinos.',
    confirmMakeNeighborTitle: 'Quitar como administrador',
    confirmMakeNeighborMessage: '{{name}} seguirá siendo vecino, pero ya no podrá administrar la comunidad.',
    householdLabel: 'Vivienda',
    assignHousehold: 'Asignar vivienda',
    unassignHousehold: 'Quitar vivienda',
    assignTitle: 'Vivienda de {{name}}',
    assignCurrent: 'Actual: {{label}}',
    assignEmpty: 'Aún no hay viviendas. Crea la primera aquí abajo.',
    assignSearchPlaceholder: 'Buscar vivienda',
    assignNoResults: 'Ninguna vivienda coincide',
    newHouseholdLabel: '¿No está en la lista? Crea una nueva',
    newHouseholdPlaceholder: 'Ej. Casa 12',
    createAndAssign: 'Crear y asignar',
    householdExists: 'Ya existe una vivienda con ese nombre.',
    actionError: 'No se pudo completar la acción. Inténtalo de nuevo.',
    errorLastAdmin: 'Debe quedar al menos un administrador activo.',
    errorHouseholdMissing: 'Esa vivienda ya no existe. Actualiza la lista e inténtalo de nuevo.',
    errorNoPermission: 'Tu cuenta no tiene permiso para esta acción.',
    errorOffline: 'Sin conexión. Revisa tu internet e inténtalo de nuevo.',
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
