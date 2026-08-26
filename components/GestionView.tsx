
import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { Loader2, ShieldAlert, Zap, Activity, Eye } from 'lucide-react';
import { ThemeColors } from '../types';
import { AuthUser } from './LoginView';
import ImportarView from './ImportarView';
import MonitoreoView from './MonitoreoView';
import UsuariosGestionView from './UsuariosGestionView';
import AlertasView from './AlertasView';
import GestionEmpleoView from './GestionEmpleoView';
import GestionCurricularView from './GestionCurricularView';
import GestionMercadoView from './GestionMercadoView';
// Cargados solo cuando Andrea/Michelle abren estas vistas: mermaid (motor del diagrama)
// pesa ~2MB minificado y no debe ir en el bundle principal que descargan los 60 usuarios.
const GestionDiagramaView = lazy(() => import('./GestionDiagramaView'));
const GestionTamanoView = lazy(() => import('./GestionTamanoView'));
import { sanitizeRichHtml } from '../services/sanitizeHtml';
import { downloadExcel } from '../services/excelExport';
import { logActividad } from '../services/actividadService';


interface AdminDetail extends AdminItem {
  id?:                     number;
  descLarga?:              string | null;
  imagenUrl?:              string | null;
  videoUrl?:               string | null;
  creadoPor?:              string | null;
  senalesRelacionadas?:     { uuid: string; titulo: string }[];
  escenariosRelacionados?:  { uuid: string; titulo: string }[];
  tendenciasRelacionadas?:  { uuid: string; titulo: string }[];
  nombre?:                  string | null;
  tituloDes?:               string | null;
  fechaSeñalArticulo?:      string | null;
  paisOrigen?:              string | null;
  urlFuentes?:              string[];
  probabilidad?:            number | null;
  topico?:                  string | null;
  topicosRelacionados?:     string[];
}

interface AdminItem {
  uuid:        string;
  titulo:      string;
  descripcion: string;
  fuente:      string | null;
  urlFuente:   string | null;
  pestel:      string | null;
  pestelSlug:  string | null;
  pestelColor: string;
  pestelLetra: string | null;
  pestels:     { letra: string; nombre: string; color: string }[];
  sector:      string | null;
  sectors:     string[];
  idEstado:    number;
  estado:      { label: string; slug: string };
  fecha:       string | null;
  fechaArchivado?: string | null;
  diasArchivoRestantes?: number | null;
  diasArchivoRetencion?: number | null;
  topico:      string | null;
}

interface PageData {
  total: number;
  page:  number;
  pages: number;
  data:  AdminItem[];
}

interface PestelOption {
  id_pestel:     number;
  nombre_pestel: string;
  color:         string;
  letra_codigo:  string;
}

interface SectorOption {
  id_sector:     string;
  nombre_sector: string;
}

interface FormState {
  nombre:    string;
  tituloDes: string;
  pais:      string;
  sectorIds: string[];
  pestelIds: string[];
  horizonte: string;
  descCorta: string;
  descLarga: string;
  logica:      string;
  fuente:               string;
  urlFuente:            string;
  urlFuentesEscenario:  string[];
  imagenUrl:            string;
  videoUrl:             string;
  autor:                string;
  fechaArticulo:        string;
  estadoId:  string;
}

const FORM_EMPTY: FormState = {
  nombre: '', tituloDes: '', pais: '',
  sectorIds: [], pestelIds: [], horizonte: '',
  descCorta: '', descLarga: '',
  logica: '',
  fuente: '', urlFuente: '', urlFuentesEscenario: [''], imagenUrl: '', videoUrl: '',
  autor: '', fechaArticulo: '',
  estadoId: '3',
};


const COUNTRIES = [
  'Afganistán','Albania','Alemania','Andorra','Angola','Antigua y Barbuda',
  'Arabia Saudita','Argelia','Argentina','Armenia','Australia','Austria',
  'Azerbaiyán','Bahamas','Bangladés','Barbados','Baréin','Bélgica',
  'Belice','Benín','Bielorrusia','Bolivia','Bosnia y Herzegovina','Botsuana',
  'Brasil','Brunéi','Bulgaria','Burkina Faso','Burundi','Bután',
  'Cabo Verde','Camboya','Camerún','Canadá','Catar','Chad',
  'Chile','China','Chipre','Colombia','Comoras','Congo',
  'Corea del Norte','Corea del Sur','Costa de Marfil','Costa Rica','Croacia','Cuba',
  'Dinamarca','Dominica','Ecuador','Egipto','El Salvador','Emiratos Árabes Unidos',
  'Eritrea','Eslovaquia','Eslovenia','España','Estados Unidos','Estonia',
  'Etiopía','Filipinas','Finlandia','Fiyi','Francia','Gabón',
  'Gambia','Georgia','Ghana','Granada','Grecia','Guatemala',
  'Guinea','Guinea Ecuatorial','Guinea-Bisáu','Guyana','Haití','Honduras',
  'Hungría','India','Indonesia','Irak','Irán','Irlanda',
  'Islandia','Islas Marshall','Islas Salomón','Israel','Italia',
  'Jamaica','Japón','Jordania','Kazajistán','Kenia','Kirguistán',
  'Kiribati','Kosovo','Kuwait','Laos','Lesoto','Letonia',
  'Líbano','Liberia','Libia','Liechtenstein','Lituania','Luxemburgo',
  'Madagascar','Malasia','Malaui','Maldivas','Malí',
  'Malta','Marruecos','Mauricio','Mauritania','México','Micronesia',
  'Moldavia','Mónaco','Mongolia','Montenegro','Mozambique','Myanmar',
  'Namibia','Nauru','Nepal','Nicaragua','Níger','Nigeria',
  'Noruega','Nueva Zelanda','Omán','Países Bajos','Pakistán','Palaos',
  'Panamá','Papúa Nueva Guinea','Paraguay','Perú','Polonia','Portugal',
  'Reino Unido','República Centroafricana','República Checa',
  'República Democrática del Congo','República Dominicana','Ruanda',
  'Rumania','Rusia','Samoa','San Marino','Santa Lucía','Senegal',
  'Serbia','Seychelles','Sierra Leona','Singapur','Siria','Somalia',
  'Sri Lanka','Sudáfrica','Sudán','Sudán del Sur','Suecia','Suiza',
  'Surinam','Tailandia','Tanzania','Tayikistán','Togo','Tonga',
  'Trinidad y Tobago','Túnez','Turkmenistán','Turquía','Tuvalu',
  'Ucrania','Uganda','Uruguay','Uzbekistán','Vanuatu','Venezuela',
  'Vietnam','Yemen','Yibuti','Zambia','Zimbabue',
  'Global','Europa','América Latina','Asia Pacífico','Oriente Medio','África Subsahariana',
  'Palestina','Caribe','África','África Oriental','África Austral','Norte de África',
  'Sudeste Asiático','Asia Central','Asia del Sur','Asia del Sudeste','Asia-Pacífico',
  'Medio Oriente','América del Norte','América del Sur','América Central',
  'Oceanía','Europa del Este','Europa Occidental','Antártida',
];

type Tab = 'senales' | 'tendencias' | 'escenarios' | 'importar' | 'monitoreo' | 'usuarios' | 'alertas' | 'empleo' | 'curricular' | 'mercado' | 'diagrama' | 'tamano';

//----------------reorg Gestion----------------
type Seccion = 'radar' | 'empleo' | 'curricular' | 'mercado' | 'usuarios' | 'alertas' | 'monitoreo' | 'diagrama' | 'tamano';
const RADAR_TABS: ('senales' | 'tendencias' | 'escenarios' | 'importar')[] = ['senales', 'tendencias', 'escenarios', 'importar'];
const SECCIONES: { key: Seccion; label: string; icon: string }[] = [
  { key: 'radar',      label: 'RADAR',      icon: 'sensors' },
  { key: 'empleo',     label: 'EMPLEO',     icon: 'work' },
  { key: 'curricular', label: 'CURRICULAR', icon: 'menu_book' },
  { key: 'mercado',    label: 'MERCADO',    icon: 'query_stats' },
  { key: 'usuarios',   label: 'USUARIOS',   icon: 'group' },
  { key: 'alertas',    label: 'ALERTAS',    icon: 'notifications_active' },
  { key: 'monitoreo',  label: 'MONITOREO',  icon: 'monitoring' },
];
// Solo visibles para acastro@usil.edu.pe y mmontoya@usil.edu.pe (ver DIAGRAM_WHITELIST) — el backend
// también las bloquea con requireSpecificAdmins, esto es solo para que no aparezcan en la grilla.
const SECCIONES_DIAGRAMA: { key: Extract<Seccion, 'diagrama' | 'tamano'>; label: string; icon: string }[] = [
  { key: 'diagrama', label: 'MODELO DE DATOS', icon: 'hub' },
  { key: 'tamano',   label: 'TAMAÑO DE TABLAS', icon: 'database' },
];
const DIAGRAM_WHITELIST = new Set(['acastro@usil.edu.pe', 'mmontoya@usil.edu.pe']);
//----------------reorg Gestion----------------
// Se reinicia solo cuando el JS del navegador recarga desde cero (F5);
// se mantiene en true mientras el usuario navega por la SPA sin recargar.
let gestionMontadaEnEstaSesion = false;

interface GestionViewProps {
  themeColors: ThemeColors;
  user:        AuthUser;
}


const ALLOWED_ROLES = ['admin'];
const PAGE_LIMIT    = 10;

const TAB_CONFIG: Record<'senales' | 'tendencias' | 'escenarios' | 'importar', { label: string; nueva: string }> = {
  senales:    { label: 'SEÑALES',    nueva: 'Nueva Señal'    },
  tendencias: { label: 'TENDENCIAS', nueva: 'Nueva Tendencia' },
  escenarios: { label: 'ESCENARIOS', nueva: 'Nuevo Escenario' },
  importar:   { label: 'IMPORTAR',   nueva: ''               },
};


const ESTADO_TRANSITIONS: Record<string, { id: number; label: string; icon: string }[]> = {
  borrador:  [{ id: 2, label: 'Enviar a revisión', icon: 'send'         }],
  revision:  [
    { id: 1, label: 'Publicar',            icon: 'check_circle' },
    { id: 3, label: 'Volver a borrador',   icon: 'undo'          },
  ],
  publicado: [{ id: 2, label: 'Volver a revisión', icon: 'rate_review'  }],
  archivado: [{ id: 3, label: 'Restaurar a borrador', icon: 'restore'   }],
};


const ESTADO_BADGE: Record<string, { bg: string; text: string; icon: string }> = {
  publicado: { bg: '#d1fae5', text: '#065f46', icon: 'check_circle' },
  revision:  { bg: '#ffedd5', text: '#9a3412', icon: 'schedule'      },
  borrador:  { bg: '#e2e8f0', text: '#475569', icon: 'edit'          },
  archivado: { bg: '#e5e7eb', text: '#374151', icon: 'inventory_2'   },
};


function avatarColors(hex: string) {
  return { bg: hex + '22', text: hex };
}

function authHeaders() {
  return { 'Content-Type': 'application/json' };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function getEstadoInfo(id: number): { label: string; slug: string } {
  const map: Record<number, { label: string; slug: string }> = {
    1: { label: 'Publicado',   slug: 'publicado' },
    2: { label: 'En revisión', slug: 'revision'  },
    3: { label: 'Borrador',    slug: 'borrador'  },
    4: { label: 'Archivado',   slug: 'archivado' },
  };
  return map[id] || { label: 'Borrador', slug: 'borrador' };
}


const GestionView: React.FC<GestionViewProps> = ({ themeColors, user }) => {
  //----------------reorg Gestion----------------
  // Al entrar a Gestion desde otro modulo (navegacion SPA) siempre se parte
  // sin seccion seleccionada, para que el usuario elija. Al refrescar la
  // pagina (F5) se restaura la ultima sub-vista, como se pidio antes: se
  // distingue un caso del otro con una bandera a nivel de modulo, que solo
  // se reinicia cuando el JS del navegador vuelve a cargar desde cero.
  const [activeTab,    setActiveTab]    = useState<Tab | null>(() => {
    const esRecarga = !gestionMontadaEnEstaSesion;
    gestionMontadaEnEstaSesion = true;
    if (!esRecarga) return null;
    const stored = localStorage.getItem('radar_gestion_tab') as Tab | null;
    return stored && ['senales', 'tendencias', 'escenarios', 'importar', 'monitoreo', 'usuarios', 'alertas', 'empleo', 'curricular', 'mercado', 'diagrama', 'tamano'].includes(stored) ? stored : null;
  });
  const [pageData,     setPageData]     = useState<PageData | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [page,         setPage]         = useState(1);
  const [search,       setSearch]       = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');
  const [openMenu,       setOpenMenu]       = useState<string | null>(null);
  const [changingId,     setChangingId]     = useState<string | null>(null);
  const [selectedItem,   setSelectedItem]   = useState<AdminItem | null>(null);

  const [pestelFilter,      setPestelFilter]      = useState<string[]>([]);
  const [sectorFilter,      setSectorFilter]      = useState<string[]>([]);
  const [horizonteFilter,   setHorizonteFilter]   = useState<string>('');
  const [pestelFiltOpen,    setPestelFiltOpen]    = useState(false);
  const [sectorFiltOpen,    setSectorFiltOpen]    = useState(false);
  const pestelFiltRef = useRef<HTMLDivElement>(null);
  const sectorFiltRef = useRef<HTMLDivElement>(null);
  const [selectedDetail, setSelectedDetail] = useState<AdminDetail | null>(null);
  const [detailLoading,  setDetailLoading]  = useState(false);
  const [showDescLargaDetail, setShowDescLargaDetail] = useState(false);

  const [showCreate,    setShowCreate]    = useState(false);
  const [createForm,    setCreateForm]    = useState<FormState>(FORM_EMPTY);
  const [fieldErrors,   setFieldErrors]   = useState<Partial<Record<keyof FormState, string>>>({});
  const [creating,      setCreating]      = useState(false);
  const [createError,   setCreateError]   = useState<string | null>(null);
  const [pestels,       setPestels]       = useState<PestelOption[]>([]);
  const [sectors,       setSectors]       = useState<SectorOption[]>([]);

  const [archiveTarget, setArchiveTarget] = useState<AdminItem | null>(null);
  const [archiving,     setArchiving]     = useState(false);
  const [archiveError,  setArchiveError]  = useState<string | null>(null);

  const [editMode, setEditMode] = useState(false);
  const [editId,   setEditId]   = useState<string | null>(null);
  const descLargaRef = useRef<HTMLDivElement>(null);
  const menuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [tendenciasRel,  setTendenciasRel]  = useState<{ uuid: string; titulo: string }[]>([]);
  const [escenariosRel,  setEscenariosRel]  = useState<{ uuid: string; titulo: string }[]>([]);
  const [tendSearch,     setTendSearch]     = useState('');
  const [escSearch,      setEscSearch]      = useState('');
  const [tendResults,    setTendResults]    = useState<{ uuid: string; titulo: string }[]>([]);
  const [escResults,     setEscResults]     = useState<{ uuid: string; titulo: string }[]>([]);
  const [tendShowDrop,   setTendShowDrop]   = useState(false);
  const [escShowDrop,    setEscShowDrop]    = useState(false);
  const tendTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const escTimerRef  = useRef<ReturnType<typeof setTimeout>>();

  const [senalesRel,   setSenalesRel]   = useState<{ uuid: string; titulo: string }[]>([]);
  const [senSearch,    setSenSearch]    = useState('');
  const [senResults,   setSenResults]   = useState<{ uuid: string; titulo: string }[]>([]);
  const [senShowDrop,  setSenShowDrop]  = useState(false);
  const senTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const [pestelDropOpen, setPestelDropOpen] = useState(false);
  const pestelDropRef   = useRef<HTMLDivElement>(null);

  const [sectorDropOpen, setSectorDropOpen] = useState(false);
  const sectorDropRef   = useRef<HTMLDivElement>(null);

  const [importing,    setImporting]    = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; total: number; errors: { fila: number; error: string }[]; warnings?: { fila: number; aviso: string }[] } | null>(null);
  const fileInputRef    = useRef<HTMLInputElement>(null);
  const relInputRef     = useRef<HTMLInputElement>(null);
  const [importingRel,  setImportingRel]  = useState(false);

  const [editDates, setEditDates] = useState<{
    creacion: string; publicacion: string; actualizacion: string;
  } | null>(null);

  const canAccess = ALLOWED_ROLES.includes(user.rol);
  const canAccessDiagramas = canAccess && DIAGRAM_WHITELIST.has((user.correo || '').toLowerCase());


  const fetchData = useCallback(async () => {
    if (!canAccess || activeTab === null || activeTab === 'importar' || activeTab === 'monitoreo' || activeTab === 'usuarios' || activeTab === 'alertas' || activeTab === 'empleo' || activeTab === 'curricular' || activeTab === 'mercado' || activeTab === 'diagrama' || activeTab === 'tamano') return;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({
        page:  String(page),
        limit: String(PAGE_LIMIT),
        ...(search                  && { q:       search                      }),
        ...(estadoFilter            && { estado:  estadoFilter                 }),
        ...(pestelFilter.length > 0 && { pestel:  pestelFilter.join(',')       }),
        ...(sectorFilter.length > 0 && { sector:  sectorFilter.join(',')       }),
        ...(activeTab === 'escenarios' && horizonteFilter && { horizonte: horizonteFilter }),
      });
      const res = await fetch(`/api/admin/${activeTab}?${params}`, { headers: authHeaders() });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Error ${res.status}`);
      setPageData(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar.');
    } finally {
      setLoading(false);
    }
  }, [canAccess, activeTab, page, search, estadoFilter, pestelFilter, sectorFilter, horizonteFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const [exportingListado, setExportingListado] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExportListadoExcel = async () => {
    if (!pageData || exportingListado) return;
    setExportingListado(true);
    setExportError(null);
    try {
      const label = TAB_CONFIG[activeTab as keyof typeof TAB_CONFIG]?.label || activeTab;
      const filtrosAplicados = {
        search,
        estadoFilter,
        pestelFilter,
        sectorFilter,
        horizonteFilter,
      };
      const hasFiltros = Boolean(
        search || estadoFilter || pestelFilter.length > 0 || sectorFilter.length > 0 || horizonteFilter
      );

      const listParams = new URLSearchParams({
        limit: '100',
        ...(hasFiltros && search                  && { q:       search                }),
        ...(hasFiltros && estadoFilter            && { estado:  estadoFilter           }),
        ...(hasFiltros && pestelFilter.length > 0 && { pestel:  pestelFilter.join(',') }),
        ...(hasFiltros && sectorFilter.length > 0 && { sector:  sectorFilter.join(',') }),
        ...(activeTab === 'escenarios' && horizonteFilter && { horizonte: horizonteFilter }),
      });

      let allItems: AdminItem[] = [];
      let currentPage = 1;
      let totalPages = 1;
      do {
        listParams.set('page', String(currentPage));
        const res = await fetch(`/api/admin/${activeTab}?${listParams}`, { headers: authHeaders() });
        if (!res.ok) throw new Error('No se pudo obtener el listado completo.');
        const pd: PageData = await res.json();
        allItems = allItems.concat(pd.data);
        totalPages = pd.pages;
        currentPage++;
      } while (currentPage <= totalPages);

      const BATCH = 6;
      const details: Record<string, any>[] = [];
      for (let i = 0; i < allItems.length; i += BATCH) {
        const batch = allItems.slice(i, i + BATCH);
        const batchDetails = await Promise.all(batch.map(async item => {
          try {
            const r = await fetch(`/api/admin/${activeTab}/${item.uuid}`, { headers: authHeaders() });
            if (!r.ok) return item;
            const d = await r.json();
            return { ...item, ...d };
          } catch {
            return item;
          }
        }));
        details.push(...batchDetails);
      }

      await downloadExcel(`Listado_${label.replace(/\s+/g, '_')}`, [{
        name: label.slice(0, 31),
        columns: [
          { header: 'Título', key: 'titulo', width: 45 },
          { header: 'Descripción corta', key: 'descCorta', width: 60 },
          { header: 'Descripción larga', key: 'descLarga', width: 80 },
          { header: 'Razón de cambio', key: 'razonCambio', width: 40 },
          { header: 'Sector', key: 'sector', width: 25 },
          { header: 'PESTEL', key: 'pestel', width: 20 },
          { header: 'Tópico', key: 'topico', width: 25 },
          { header: 'Fuente', key: 'fuente', width: 30 },
          { header: 'URL Fuente', key: 'urlFuente', width: 50 },
          { header: 'Imagen URL', key: 'imagenUrl', width: 50 },
          { header: 'Video URL', key: 'videoUrl', width: 50 },
          { header: 'Autor', key: 'autor', width: 20 },
          { header: 'País de origen', key: 'paisOrigen', width: 18 },
          { header: 'Horizonte', key: 'horizonte', width: 14 },
          { header: 'Probabilidad', key: 'probabilidad', width: 14 },
          { header: 'Estado', key: 'estado', width: 16 },
          { header: 'Fecha creación', key: 'fechaCreacion', width: 16 },
          { header: 'Fecha publicación', key: 'fechaPublicacion', width: 16 },
          { header: 'Fecha actualización', key: 'fechaActualizacion', width: 16 },
          { header: 'Señales relacionadas', key: 'senalesRel', width: 50 },
          { header: 'Tendencias relacionadas', key: 'tendenciasRel', width: 50 },
          { header: 'Escenarios relacionados', key: 'escenariosRel', width: 50 },
        ],
        rows: details.map(d => ({
          titulo: d.titulo ?? d.tituloDes ?? '',
          descCorta: d.descCorta ?? d.descripcion ?? '',
          descLarga: stripHtml(d.descLarga || ''),
          razonCambio: d.razonCambio || '',
          sector: d.sector || (d.sectors || []).join(', ') || '',
          pestel: d.pestel || (d.pestels || []).map((p: any) => p.nombre).join(', ') || '',
          topico: d.topico || '',
          fuente: d.fuente || '',
          urlFuente: d.urlFuente || '',
          imagenUrl: d.imagenUrl || '',
          videoUrl: d.videoUrl || '',
          autor: d.autor || '',
          paisOrigen: d.paisOrigen || '',
          horizonte: d.horizonte || '',
          probabilidad: d.probabilidad ?? '',
          estado: d.estado?.label || '',
          fechaCreacion: d.fechaCreacion || '',
          fechaPublicacion: d.fechaPublicacion || '',
          fechaActualizacion: d.fechaActualizacion || '',
          senalesRel: (d.senalesRelacionadas || []).map((x: any) => x.titulo).join(', '),
          tendenciasRel: (d.tendenciasRelacionadas || []).map((x: any) => x.titulo).join(', '),
          escenariosRel: (d.escenariosRelacionados || []).map((x: any) => x.titulo).join(', '),
        })),
      }]);

      logActividad('descargar_informe', {
        modulo: 'gestion',
        elementoTipo: 'listado',
        elementoTitulo: label,
        metadata: {
          formato: 'xlsx', tab: activeTab, total: details.length,
          alcance: hasFiltros ? 'con_filtros' : 'todos_los_registros',
          filtros: filtrosAplicados,
        },
      });
    } catch (e: unknown) {
      setExportError(e instanceof Error ? e.message : 'Error al exportar el listado.');
    } finally {
      setExportingListado(false);
    }
  };


  useEffect(() => {
    if (!openMenu) return;
    const handler = (e: MouseEvent) => {
      const ref = menuRefs.current[openMenu];
      if (ref && !ref.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenu]);


  useEffect(() => {
    if (!pestelDropOpen) return;
    const handler = (e: MouseEvent) => {
      if (pestelDropRef.current && !pestelDropRef.current.contains(e.target as Node))
        setPestelDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pestelDropOpen]);


  useEffect(() => {
    if (!sectorDropOpen) return;
    const handler = (e: MouseEvent) => {
      if (sectorDropRef.current && !sectorDropRef.current.contains(e.target as Node))
        setSectorDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [sectorDropOpen]);


  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pestelFiltRef.current && !pestelFiltRef.current.contains(e.target as Node)) setPestelFiltOpen(false);
      if (sectorFiltRef.current && !sectorFiltRef.current.contains(e.target as Node)) setSectorFiltOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);


  const handleImportRelaciones = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImportingRel(true); setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/admin/relaciones/import', {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      setImportResult(data);
    } catch (err: unknown) {
      setImportResult({ imported: 0, total: 0, errors: [{ fila: 0, error: err instanceof Error ? err.message : 'Error desconocido' }] });
    } finally {
      setImportingRel(false);
    }
  };


  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true); setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/admin/${activeTab}/import`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      setImportResult(data);
      if (data.imported > 0) fetchData();
    } catch (err: unknown) {
      setImportResult({ imported: 0, total: 0, errors: [{ fila: 0, error: err instanceof Error ? err.message : 'Error desconocido' }] });
    } finally {
      setImporting(false);
    }
  };

  const switchTab = (tab: Tab) => {
    localStorage.setItem('radar_gestion_tab', tab);
    setActiveTab(tab); setPage(1); setSearch(''); setEstadoFilter('');
    setPestelFilter([]); setSectorFilter([]); setHorizonteFilter('');
    setImportResult(null);
    setPageData(null);
  };

  //----------------reorg Gestion----------------
  const volverASeleccion = () => {
    localStorage.removeItem('radar_gestion_tab');
    setActiveTab(null);
  };


  const handleEstadoChange = async (item: AdminItem, id_estado: number) => {
    setOpenMenu(null); setChangingId(item.uuid);
    try {
      const res = await fetch(`/api/admin/${activeTab}/${item.uuid}/estado`, {
        method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ id_estado }),
      });
      if (!res.ok) { alert((await res.json().catch(() => ({}))).error || 'Error'); return; }
      const updated = { ...item, idEstado: id_estado, estado: getEstadoInfo(id_estado) };
      setPageData(prev => prev ? {
        ...prev,
        data: prev.data.map(r => r.uuid === item.uuid ? updated : r),
      } : prev);
      setSelectedItem(prev => prev?.uuid === item.uuid ? updated : prev);
    } catch { alert('Error de conexión.'); }
    finally { setChangingId(null); }
  };


  const handleVerDetalle = async (item: AdminItem) => {
    setSelectedItem(item);
    setSelectedDetail(null);
    setDetailLoading(true);
    setShowDescLargaDetail(false);
    try {
      const res = await fetch(`/api/admin/${activeTab}/${item.uuid}`, { headers: authHeaders() });
      if (res.ok) setSelectedDetail(await res.json());
    } catch {}
    finally { setDetailLoading(false); }
  };


  const handleArchivar = async () => {
    if (!archiveTarget) return;
    setArchiving(true); setArchiveError(null);
    try {
      const res = await fetch(`/api/admin/${activeTab}/${archiveTarget.uuid}/archive`, {
        method: 'PATCH', headers: authHeaders(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setArchiveError(data.error || 'Error al archivar.');
        return;
      }

      setPageData(prev => prev ? {
        ...prev,
        data:  prev.data.filter(r => r.uuid !== archiveTarget.uuid),
        total: prev.total - 1,
      } : prev);
      if (selectedItem?.uuid === archiveTarget.uuid) setSelectedItem(null);
      setArchiveTarget(null);
    } catch { setArchiveError('Error de conexión.'); }
    finally  { setArchiving(false); }
  };


  const searchRelaciones = (
    q: string,
    timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | undefined>,
    tab: 'senales' | 'tendencias' | 'escenarios',
    setResults: (r: { uuid: string; titulo: string }[]) => void,
    setShowDrop: (v: boolean) => void,
  ) => {
    clearTimeout(timerRef.current);
    if (!q.trim()) { setResults([]); setShowDrop(false); return; }
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/${tab}?q=${encodeURIComponent(q)}&limit=8`, { headers: authHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        setResults((data.data || []).map((r: AdminItem) => ({ uuid: r.uuid, titulo: r.titulo })));
        setShowDrop(true);
      } catch {}
    }, 350);
  };


  const fetchOptions = useCallback(async () => {
    if (pestels.length > 0) return;
    try {
      const res = await fetch('/api/admin/options', { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setPestels(data.pestels || []);
      setSectors(data.sectors || []);
    } catch {}
  }, [pestels.length]);


  useEffect(() => { fetchOptions(); }, [fetchOptions]);


  const openCreate = () => {
    setEditMode(false);
    setEditId(null);
    setEditDates(null);
    setCreateForm(FORM_EMPTY);
    setFieldErrors({});
    setCreateError(null);
    setShowCreate(true);
    fetchOptions();
    setTendenciasRel([]); setEscenariosRel([]);
    setTendSearch('');    setEscSearch('');
    setTendResults([]);   setEscResults([]);
    setTendShowDrop(false); setEscShowDrop(false);
    setSenalesRel([]); setSenSearch(''); setSenResults([]); setSenShowDrop(false);
    setPestelDropOpen(false);

    setTimeout(() => { if (descLargaRef.current) descLargaRef.current.innerHTML = ''; }, 50);
  };


  const openEdit = async (item: AdminItem) => {
    setOpenMenu(null);
    setCreateError(null);
    setFieldErrors({});
    fetchOptions();
    try {
      const res = await fetch(`/api/admin/${activeTab}/${item.uuid}`, { headers: authHeaders() });
      if (!res.ok) { alert('No se pudo cargar el elemento para editar.'); return; }
      const d = await res.json();
      setCreateForm({
        nombre:    d.nombre    || '',
        tituloDes: d.tituloDes || '',
        pais:      d.pais      || '',
        sectorIds: d.sectorIds || (d.sectorId ? [d.sectorId] : []),
        pestelIds: d.pestelIds || [],
        horizonte: d.horizonte || '',
        descCorta: d.descCorta || '',
        descLarga: d.descLarga || '',
        logica:    d.logica    || '',
        fuente:    d.fuente    || '',
        urlFuente: d.urlFuente || '',
        urlFuentesEscenario: (d.urlFuentes && d.urlFuentes.length) ? d.urlFuentes : [''],
        imagenUrl: d.imagenUrl || '',
        videoUrl:  d.videoUrl  || '',
        autor:     d.autor     || '',
        fechaArticulo: d.fechaArticulo || '',
        estadoId:  d.estadoId  || '3',
      });
      setTimeout(() => {
        if (descLargaRef.current) descLargaRef.current.innerHTML = sanitizeRichHtml(d.descLarga || '');
      }, 50);
      setTendenciasRel(d.tendenciasRelacionadas || []);
      setEscenariosRel(d.escenariosRelacionados || []);
      setSenalesRel(d.senalesRelacionadas || []);
      setTendSearch('');    setEscSearch('');    setSenSearch('');
      setTendResults([]);   setEscResults([]);   setSenResults([]);
      setTendShowDrop(false); setEscShowDrop(false); setSenShowDrop(false);
      setPestelDropOpen(false);
      setEditDates({
        creacion:     d.fechaCreacion     || '—',
        publicacion:  d.fechaPublicacion  || '—',
        actualizacion: d.fechaActualizacion || '—',
      });
      setEditMode(true);
      setEditId(item.uuid);
      setShowCreate(true);
    } catch { alert('Error de conexión al cargar el elemento.'); }
  };


  const validateForm = (): boolean => {
    const errs: Partial<Record<keyof FormState, string>> = {};

    if (!createForm.nombre.trim())           errs.nombre    = 'El nombre es obligatorio.';
    if (!createForm.tituloDes.trim())            errs.tituloDes = 'El título es obligatorio.';
    else if (createForm.tituloDes.length > 180)  errs.tituloDes = 'Máximo 180 caracteres.';
    if (createForm.sectorIds.length === 0)   errs.sectorIds = 'Selecciona al menos un sector.';
    if (createForm.pestelIds.length === 0)  errs.pestelIds = 'Selecciona al menos una categoría PESTEL.';

    if (!createForm.descCorta.trim())        errs.descCorta = 'La descripción corta es obligatoria.';
    if (createForm.descCorta.length > 250)   errs.descCorta = 'Máximo 250 caracteres.';
    const larga     = descLargaRef.current?.innerText?.trim() || '';
    const largaLen  = descLargaRef.current?.innerText?.length || 0;
    if (!larga)                              errs.descLarga = 'La descripción larga es obligatoria.';
    else if (largaLen > 10000)               errs.descLarga = 'Máximo 10 000 caracteres.';
    if (activeTab === 'tendencias') {
      if (createForm.logica.trim() && createForm.logica.length > 1000) errs.logica = 'Máximo 1 000 caracteres.';
    }
    if (activeTab === 'escenarios') {
      if (!createForm.logica.trim()) errs.logica    = 'La lógica del escenario es obligatoria.';
      else if (createForm.logica.length > 1000) errs.logica = 'Máximo 1 000 caracteres.';
    }

    const isUrl = (v: string) => /^https?:\/\/.+\..+/.test(v.trim());
    if (activeTab === 'senales') {

      if (!createForm.fuente.trim())    errs.fuente    = 'La fuente es obligatoria.';
      if (!createForm.urlFuente.trim()) errs.urlFuente = 'La URL de la fuente es obligatoria.';
      else if (!isUrl(createForm.urlFuente)) errs.urlFuente = 'Ingresa una URL válida (https://...)';
      if (createForm.imagenUrl.trim() && !isUrl(createForm.imagenUrl)) errs.imagenUrl = 'Ingresa una URL válida (https://...)';
    }

    if (activeTab === 'tendencias') {
      if (createForm.urlFuente.trim() && !isUrl(createForm.urlFuente)) errs.urlFuente = 'Ingresa una URL válida (https://...)';
      if (createForm.imagenUrl.trim() && !isUrl(createForm.imagenUrl)) errs.imagenUrl = 'Ingresa una URL válida (https://...)';
    }

    if (activeTab === 'escenarios') {
      createForm.urlFuentesEscenario.forEach((u, i) => {
        if (u.trim() && !isUrl(u)) errs[`urlFuenteEsc_${i}`] = 'URL inválida';
      });
      if (createForm.imagenUrl.trim() && !isUrl(createForm.imagenUrl)) errs.imagenUrl = 'Ingresa una URL válida (https://...)';
    }

    if (createForm.videoUrl.trim() && !isUrl(createForm.videoUrl)) errs.videoUrl = 'Ingresa una URL válida (https://...)';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };


  const handleCreate = async () => {
    if (!validateForm()) return;
    setCreating(true); setCreateError(null);
    const descLargaHtml = sanitizeRichHtml(descLargaRef.current?.innerHTML || '');
    const url    = editMode && editId ? `/api/admin/${activeTab}/${editId}` : `/api/admin/${activeTab}`;
    const method = editMode ? 'PUT' : 'POST';
    try {
      const res = await fetch(url, {
        method,
        headers: authHeaders(),
        body: JSON.stringify({
          nombre:    createForm.nombre.trim(),
          tituloDes: createForm.tituloDes.trim() || undefined,
          descCorta: createForm.descCorta.trim(),
          descLarga: descLargaHtml,
          fuente:    createForm.fuente.trim()    || undefined,
          urlFuente: createForm.urlFuente.trim() || undefined,
          imagenUrl: createForm.imagenUrl.trim() || undefined,
          videoUrl:  createForm.videoUrl.trim()  || undefined,
          pestelIds: createForm.pestelIds,
          pestelId:  createForm.pestelIds[0]     || undefined,
          sectorIds:   createForm.sectorIds,
          sectorId:    createForm.sectorIds[0]      || undefined,
          autor:       createForm.autor.trim() || undefined,
          id_estado:   Number(createForm.estadoId),
          ...(activeTab === 'senales' && {
            fechaArticulo: createForm.fechaArticulo || undefined,
            tendenciasRel: tendenciasRel.map(r => r.uuid),
            escenariosRel: escenariosRel.map(r => r.uuid),
          }),
          ...(activeTab === 'tendencias' && {
            pais:          createForm.pais.trim() || undefined,
            logica:        createForm.logica.trim() || undefined,
            senalesRel:    senalesRel.map(r => r.uuid),
            escenariosRel: escenariosRel.map(r => r.uuid),
          }),
          ...(activeTab === 'escenarios' && {
            logica:        createForm.logica.trim() || undefined,
            urlFuentes:    createForm.urlFuentesEscenario.map(u => u.trim()).filter(Boolean),
            senalesRel:    senalesRel.map(r => r.uuid),
            tendenciasRel: tendenciasRel.map(r => r.uuid),
          }),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setCreateError(data.error || 'Error al guardar.'); return; }
      setShowCreate(false);
      setCreateForm(FORM_EMPTY);
      setEditMode(false);
      setEditId(null);
      setTendenciasRel([]); setEscenariosRel([]); setSenalesRel([]);
      fetchData();
    } catch { setCreateError('Error de conexión.'); }
    finally { setCreating(false); }
  };


  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-24 px-8 text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
          style={{ backgroundColor: '#fee2e2' }}>
          <ShieldAlert size={30} style={{ color: '#ef4444' }} />
        </div>
        <h2 className={`text-lg font-bold mb-1 ${themeColors.headerText}`}>Acceso restringido</h2>
        <p className="text-sm max-w-xs" style={{ color: '#94a3b8' }}>
          Solo <strong>Administrador</strong> o <strong>Analista</strong> pueden acceder a esta sección.
        </p>
      </div>
    );
  }

  const totalPages  = pageData?.pages ?? 1;
  const currentPage = pageData?.page  ?? page;

  const isDark = themeColors.bg.includes('950') || themeColors.bg.includes('slate-900');


  if (activeTab === 'monitoreo') {
    return <MonitoreoView themeColors={themeColors} onVolver={volverASeleccion} />;
  }

  if (activeTab === 'usuarios') {
    return <UsuariosGestionView themeColors={themeColors} onVolver={volverASeleccion} />;
  }

  if (activeTab === 'alertas') {
    return <AlertasView themeColors={themeColors} onVolver={volverASeleccion} />;
  }


  if (activeTab === 'importar') {
    return <ImportarView themeColors={themeColors} onVolver={() => switchTab('senales')} />;
  }

  if (activeTab === 'empleo') {
    return <GestionEmpleoView themeColors={themeColors} onVolver={volverASeleccion} />;
  }

  if (activeTab === 'curricular') {
    return <GestionCurricularView themeColors={themeColors} userRole={user.rol} onVolver={volverASeleccion} />;
  }

  if (activeTab === 'mercado') {
    return <GestionMercadoView themeColors={themeColors} onVolver={volverASeleccion} />;
  }

  if (activeTab === 'diagrama') {
    if (!canAccessDiagramas) return null;
    return (
      <Suspense fallback={<div style={{ padding: 32, fontSize: 13, color: '#94a3b8' }}>Cargando…</div>}>
        <GestionDiagramaView themeColors={themeColors} onVolver={volverASeleccion} />
      </Suspense>
    );
  }

  if (activeTab === 'tamano') {
    if (!canAccessDiagramas) return null;
    return (
      <Suspense fallback={<div style={{ padding: 32, fontSize: 13, color: '#94a3b8' }}>Cargando…</div>}>
        <GestionTamanoView themeColors={themeColors} onVolver={volverASeleccion} />
      </Suspense>
    );
  }

  //----------------reorg Gestion----------------
  if (activeTab === null) {
    return (
      <div className="p-6 md:p-8 space-y-6">
        <div>
          <h1 className={`text-2xl md:text-3xl font-bold mb-2 ${themeColors.headerText}`}>
            Inteligencia Educativa Estratégica
          </h1>
          <p style={{ color: '#6b7280', fontSize: 14 }}>
            Elige una sección para comenzar a gestionar.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {SECCIONES.map(sec => (
            <button
              key={sec.key}
              onClick={() => switchTab(sec.key === 'radar' ? 'senales' : sec.key)}
              className={`flex items-center gap-2 px-6 py-4 rounded-xl border shadow-sm text-sm font-semibold transition-all hover:-translate-y-0.5 hover:shadow-md ${themeColors.cardBg} ${themeColors.cardBorder} ${themeColors.text}`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{sec.icon}</span>
              {sec.label}
            </button>
          ))}
          {canAccessDiagramas && SECCIONES_DIAGRAMA.map(sec => (
            <button
              key={sec.key}
              onClick={() => switchTab(sec.key)}
              className={`flex items-center gap-2 px-6 py-4 rounded-xl border shadow-sm text-sm font-semibold transition-all hover:-translate-y-0.5 hover:shadow-md ${themeColors.cardBg} ${themeColors.cardBorder} ${themeColors.text}`}
              style={{ borderColor: '#c81e4f55' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#c81e4f' }}>{sec.icon}</span>
              {sec.label}
            </button>
          ))}
        </div>
      </div>
    );
  }


  if (showCreate) {
    const tabSingular = activeTab === 'senales' ? 'Señal' : activeTab === 'tendencias' ? 'Tendencia' : 'Escenario';
    const tabPath     = activeTab === 'senales' ? 'Señales' : activeTab === 'tendencias' ? 'Tendencias' : 'Escenarios';
    const inputCls    = `w-full px-4 py-2 text-sm rounded-lg border outline-none transition-all focus:ring-2 focus:ring-blue-400/30 ${themeColors.inputBg} ${themeColors.inputBorder} ${themeColors.inputText}`;
    const charCount   = createForm.descCorta.length;

    const execRich = (cmd: string, val?: string) => {
      descLargaRef.current?.focus();
      document.execCommand(cmd, false, val);
    };

    const SectionTitle = ({ icon, title }: { icon: string; title: string }) => (
      <h3 className={`text-base font-semibold mb-4 flex items-center gap-2 ${themeColors.headerText}`}>
        <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#1978e5' }}>{icon}</span>
        {title}
      </h3>
    );

    const FieldError = ({ field }: { field: keyof FormState }) =>
      fieldErrors[field] ? (
        <p className="text-xs mt-1 flex items-center gap-1" style={{ color: '#ef4444' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>error</span>
          {fieldErrors[field]}
        </p>
      ) : null;

    return (
      <div className="p-6 md:p-8">

        <nav className="text-xs font-medium mb-6 flex items-center gap-1" style={{ color: '#9ca3af' }}>
          <button onClick={() => { setShowCreate(false); setEditMode(false); setEditId(null); }} className="hover:underline" style={{ color: '#1978e5' }}>
            Gestión
          </button>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>chevron_right</span>
          <button onClick={() => { setShowCreate(false); setEditMode(false); setEditId(null); }} className="hover:underline" style={{ color: '#1978e5' }}>
            {tabPath}
          </button>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>chevron_right</span>
          <span className={themeColors.headerText}>{editMode ? `Editar ${tabSingular}` : `Nueva ${tabSingular}`}</span>
        </nav>

        <div className="max-w-4xl mx-auto">
          <h1 className={`text-2xl font-bold mb-6 ${themeColors.headerText}`}>
            {editMode ? `Editar ${tabSingular}` : `Crear Nueva ${tabSingular}`}
          </h1>

          <div className={`rounded-xl shadow-sm border p-8 space-y-8 ${themeColors.cardBg} ${themeColors.cardBorder}`}>


            <div className={`pb-6 border-b ${themeColors.cardBorder}`}>
              <SectionTitle icon="lock" title="Datos de Control" />
              <div className={`grid gap-4 grid-cols-2 md:grid-cols-3 ${activeTab === 'senales' ? 'lg:grid-cols-7' : 'lg:grid-cols-6'}`}>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>id {tabSingular.toLowerCase()}</label>
                  <input disabled value={editMode && editId ? editId.split('-')[0].toUpperCase() : 'AUTO-GEN'}
                    className={`w-full px-3 py-1.5 text-xs rounded-lg border cursor-not-allowed ${themeColors.inputBg} ${themeColors.inputBorder}`}
                    style={{ color: '#9ca3af' }} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>creador</label>
                  <input disabled value={user.nombre}
                    className={`w-full px-3 py-1.5 text-xs rounded-lg border cursor-not-allowed ${themeColors.inputBg} ${themeColors.inputBorder}`}
                    style={{ color: '#9ca3af' }} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>actualizador</label>
                  <input disabled value={editMode ? user.nombre : '—'}
                    className={`w-full px-3 py-1.5 text-xs rounded-lg border cursor-not-allowed ${themeColors.inputBg} ${themeColors.inputBorder}`} style={{ color: '#9ca3af' }} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>fecha creación</label>
                  <input disabled value={editMode && editDates ? editDates.creacion : new Date().toLocaleDateString('es-PE')}
                    className={`w-full px-3 py-1.5 text-xs rounded-lg border cursor-not-allowed ${themeColors.inputBg} ${themeColors.inputBorder}`} style={{ color: '#9ca3af' }} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>fecha publicación</label>
                  <input disabled value={editMode && editDates ? editDates.publicacion : '—'}
                    className={`w-full px-3 py-1.5 text-xs rounded-lg border cursor-not-allowed ${themeColors.inputBg} ${themeColors.inputBorder}`} style={{ color: '#9ca3af' }} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>fecha actualización</label>
                  <input disabled value={editMode && editDates ? editDates.actualizacion : '—'}
                    className={`w-full px-3 py-1.5 text-xs rounded-lg border cursor-not-allowed ${themeColors.inputBg} ${themeColors.inputBorder}`} style={{ color: '#9ca3af' }} />
                </div>
                {activeTab === 'senales' && (
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>fecha del artículo</label>
                    <input type="date" value={createForm.fechaArticulo}
                      onChange={e => setCreateForm(f => ({ ...f, fechaArticulo: e.target.value }))}
                      className={`w-full px-3 py-1.5 text-xs rounded-lg border ${themeColors.inputBg} ${themeColors.inputBorder} ${themeColors.inputText}`} />
                  </div>
                )}
              </div>
            </div>


            <div className={`pb-6 border-b ${themeColors.cardBorder}`}>
              <SectionTitle icon="info" title="Información Principal" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium" style={{ color: '#9ca3af' }}>
                      {activeTab === 'escenarios' ? 'nombre del escenario' : `nombre de la ${tabSingular.toLowerCase()}`} <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                  </div>
                  <input
                    type="text"
                    maxLength={180}
                    value={createForm.nombre}
                    onChange={e => { setCreateForm(f => ({ ...f, nombre: e.target.value })); setFieldErrors(fe => ({ ...fe, nombre: undefined })); }}
                    placeholder={`Ej. ${tabSingular === 'Señal' ? 'Aumento del trabajo remoto' : tabSingular === 'Tendencia' ? 'Automatización del conocimiento' : 'Educación personalizada 2035'}`}
                    className={`${inputCls} ${fieldErrors.nombre ? 'border-red-400 focus:ring-red-300/30' : ''}`}
                  />
                  <FieldError field="nombre" />
                </div>


                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium" style={{ color: '#9ca3af' }}>
                      título <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <span className="text-xs font-medium" style={{ color: createForm.tituloDes.length > 180 ? '#ef4444' : '#9ca3af' }}>
                      {createForm.tituloDes.length}/180
                    </span>
                  </div>
                  <input
                    type="text"
                    maxLength={180}
                    value={createForm.tituloDes}
                    onChange={e => { setCreateForm(f => ({ ...f, tituloDes: e.target.value })); setFieldErrors(fe => ({ ...fe, tituloDes: undefined })); }}
                    placeholder={
                      activeTab === 'senales'    ? 'Ej. Señal clave de alerta temprana' :
                      activeTab === 'tendencias' ? 'Ej. El futuro de la experiencia educativa personalizada' :
                      'Título público para reportes'
                    }
                    className={`${inputCls} ${fieldErrors.tituloDes ? 'border-red-400 focus:ring-red-300/30' : ''}`}
                  />
                  <FieldError field="tituloDes" />
                </div>


                <div ref={sectorDropRef}>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>
                    sector <span style={{ color: '#ef4444' }}>*</span>
                  </label>


                  {createForm.sectorIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {createForm.sectorIds.map(id => {
                        const s = sectors.find(x => x.id_sector === id);
                        if (!s) return null;
                        return (
                          <span key={id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                            style={{ backgroundColor: '#e5e7eb', color: '#374151' }}>
                            {s.nombre_sector}
                            <button type="button"
                              onClick={() => setCreateForm(f => ({ ...f, sectorIds: f.sectorIds.filter(x => x !== id) }))}
                              className="hover:opacity-60 ml-0.5">
                              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>close</span>
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}


                  <div className="relative">
                    <button type="button"
                      onClick={() => setSectorDropOpen(v => !v)}
                      className={`w-full flex items-center justify-between px-4 py-2 text-sm rounded-lg border outline-none transition-all ${themeColors.inputBg} ${themeColors.inputBorder} ${themeColors.inputText} ${(fieldErrors as any).sectorIds ? 'border-red-400' : ''}`}>
                      <span style={{ color: '#9ca3af' }}>Selecciona un sector...</span>
                      <span className="material-symbols-outlined flex-shrink-0 transition-transform"
                        style={{ fontSize: 18, color: '#9ca3af', transform: sectorDropOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                        expand_more
                      </span>
                    </button>

                    {sectorDropOpen && (
                      <div className={`absolute z-30 left-0 right-0 top-full mt-1 rounded-lg border shadow-xl overflow-hidden ${themeColors.cardBg} ${themeColors.cardBorder}`}
                        style={{ boxShadow: '0 8px 24px -4px rgba(0,0,0,0.12)' }}>
                        {sectors.map(s => {
                          const isSel = createForm.sectorIds.includes(s.id_sector);
                          return (
                            <button key={s.id_sector} type="button"
                              onClick={() => {
                                if (!isSel) {
                                  setCreateForm(f => ({ ...f, sectorIds: [...f.sectorIds, s.id_sector] }));
                                  setFieldErrors(fe => ({ ...fe, sectorIds: undefined }));
                                }
                                setSectorDropOpen(false);
                              }}
                              className={`w-full px-4 py-2.5 text-sm text-left transition-colors ${themeColors.text}`}
                              style={{ backgroundColor: isSel ? '#f3f4f6' : undefined, color: isSel ? '#9ca3af' : undefined }}
                              onMouseEnter={e => { if (!isSel) e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                              onMouseLeave={e => { e.currentTarget.style.backgroundColor = isSel ? '#f3f4f6' : ''; }}
                            >
                              {s.nombre_sector}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <FieldError field="sectorIds" />
                </div>


                <div ref={pestelDropRef}>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>
                    categoría PESTEL <span style={{ color: '#ef4444' }}>*</span>
                  </label>


                  {createForm.pestelIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {createForm.pestelIds.map(id => {
                        const p = pestels.find(x => String(x.id_pestel) === id);
                        if (!p) return null;
                        return (
                          <span key={id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                            style={{ backgroundColor: '#e5e7eb', color: '#374151' }}>
                            {p.nombre_pestel}
                            <button type="button"
                              onClick={() => setCreateForm(f => ({ ...f, pestelIds: f.pestelIds.filter(x => x !== id) }))}
                              className="hover:opacity-60 ml-0.5">
                              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>close</span>
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}


                  <div className="relative">
                    <button type="button"
                      onClick={() => setPestelDropOpen(v => !v)}
                      className={`w-full flex items-center justify-between px-4 py-2 text-sm rounded-lg border outline-none transition-all ${themeColors.inputBg} ${themeColors.inputBorder} ${themeColors.inputText} ${fieldErrors.pestelIds ? 'border-red-400' : ''}`}>
                      <span style={{ color: '#9ca3af' }}>Selecciona una categoría...</span>
                      <span className="material-symbols-outlined flex-shrink-0 transition-transform"
                        style={{ fontSize: 18, color: '#9ca3af', transform: pestelDropOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                        expand_more
                      </span>
                    </button>

                    {pestelDropOpen && (
                      <div className={`absolute z-30 left-0 right-0 top-full mt-1 rounded-lg border shadow-xl overflow-hidden ${themeColors.cardBg} ${themeColors.cardBorder}`}
                        style={{ boxShadow: '0 8px 24px -4px rgba(0,0,0,0.12)' }}>
                        {pestels.map(p => {
                          const isSel = createForm.pestelIds.includes(String(p.id_pestel));
                          return (
                            <button key={p.id_pestel} type="button"
                              onClick={() => {
                                if (!isSel) {
                                  setCreateForm(f => ({ ...f, pestelIds: [...f.pestelIds, String(p.id_pestel)] }));
                                  setFieldErrors(fe => ({ ...fe, pestelIds: undefined }));
                                }
                                setPestelDropOpen(false);
                              }}
                              className={`w-full px-4 py-2.5 text-sm text-left transition-colors ${themeColors.text}`}
                              style={{ backgroundColor: isSel ? '#f3f4f6' : undefined, color: isSel ? '#9ca3af' : undefined }}
                              onMouseEnter={e => { if (!isSel) e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                              onMouseLeave={e => { e.currentTarget.style.backgroundColor = isSel ? '#f3f4f6' : ''; }}
                            >
                              {p.nombre_pestel}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <FieldError field="pestelIds" />
                </div>


                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>estado inicial</label>
                  <div className="relative">
                    <select
                      value={createForm.estadoId}
                      onChange={e => setCreateForm(f => ({ ...f, estadoId: e.target.value }))}
                      className={`${inputCls} appearance-none pr-8`}
                    >
                      <option value="3">Borrador</option>
                      <option value="2">En Revisión</option>
                      <option value="1">Publicado</option>
                    </select>
                    <span className="material-symbols-outlined absolute right-3 top-2.5 pointer-events-none" style={{ fontSize: 18, color: '#9ca3af' }}>expand_more</span>
                  </div>
                </div>


                {activeTab === 'tendencias' && (
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>país de origen</label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ fontSize: 18, color: '#9ca3af' }}>public</span>
                      <select
                        value={createForm.pais}
                        onChange={e => setCreateForm(f => ({ ...f, pais: e.target.value }))}
                        className={`${inputCls} appearance-none pl-10 pr-8`}
                      >
                        <option value="">Selecciona país de origen</option>
                        {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <span className="material-symbols-outlined absolute right-3 top-2.5 pointer-events-none" style={{ fontSize: 18, color: '#9ca3af' }}>expand_more</span>
                    </div>
                  </div>
                )}
              </div>
            </div>


            <div className={`pb-6 border-b ${themeColors.cardBorder}`}>
              <SectionTitle icon="description" title="Descripciones" />
              <div className="space-y-6">

                <div>
                  <div className="flex justify-between mb-1">
                    <label className="text-xs font-medium" style={{ color: '#9ca3af' }}>
                      descripción corta <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <span className="text-xs font-medium" style={{ color: charCount > 250 ? '#ef4444' : '#9ca3af' }}>
                      {charCount}/250 caracteres
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    value={createForm.descCorta}
                    onChange={e => { setCreateForm(f => ({ ...f, descCorta: e.target.value })); setFieldErrors(fe => ({ ...fe, descCorta: undefined })); }}
                    placeholder="Breve resumen (máx. 250 caracteres)..."
                    className={`${inputCls} resize-none ${fieldErrors.descCorta ? 'border-red-400' : ''}`}
                    maxLength={250}
                  />
                  <FieldError field="descCorta" />
                </div>


                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium" style={{ color: '#9ca3af' }}>
                      descripción larga <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <span id="descLargaCounter" className="text-xs font-medium" style={{ color: '#9ca3af' }}>0/10 000</span>
                  </div>
                  <div
                    className={`rounded-lg border overflow-hidden ${themeColors.cardBg} ${fieldErrors.descLarga ? 'border-red-400' : themeColors.cardBorder}`}
                  >

                    <div className={`flex items-center gap-0.5 p-2 border-b ${themeColors.cardBorder} ${themeColors.tableHeaderBg}`}>
                      {[
                        { cmd: 'bold',          icon: 'format_bold',           title: 'Negrita' },
                        { cmd: 'italic',         icon: 'format_italic',         title: 'Cursiva' },
                        { cmd: 'underline',      icon: 'format_underlined',     title: 'Subrayado' },
                      ].map(b => (
                        <button key={b.cmd} type="button" title={b.title}
                          onClick={() => execRich(b.cmd)}
                          className="p-1.5 rounded transition-colors"
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.06)')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#6b7280' }}>{b.icon}</span>
                        </button>
                      ))}
                      <div style={{ width: 1, height: 18, backgroundColor: '#e5e7eb', margin: '0 4px' }} />
                      {[
                        { cmd: 'insertUnorderedList', icon: 'format_list_bulleted', title: 'Lista' },
                        { cmd: 'insertOrderedList',   icon: 'format_list_numbered', title: 'Lista numerada' },
                      ].map(b => (
                        <button key={b.cmd} type="button" title={b.title}
                          onClick={() => execRich(b.cmd)}
                          className="p-1.5 rounded transition-colors"
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.06)')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#6b7280' }}>{b.icon}</span>
                        </button>
                      ))}
                    </div>

                    <div
                      ref={descLargaRef}
                      contentEditable
                      suppressContentEditableWarning
                      onInput={() => {
                        const content = descLargaRef.current?.innerText?.trim() || '';
                        const len     = descLargaRef.current?.innerText?.length  || 0;
                        if (content) setFieldErrors(fe => ({ ...fe, descLarga: undefined }));
                        const el = document.getElementById('descLargaCounter');
                        if (el) { el.textContent = `${len}/10 000`; el.style.color = len > 10000 ? '#ef4444' : '#9ca3af'; }
                      }}
                      className={`min-h-[160px] p-4 text-sm outline-none ${themeColors.inputText}`}
                      style={{ lineHeight: 1.6 }}
                      data-placeholder="Análisis detallado, implicaciones y contexto estratégico..."
                    />
                  </div>
                  <FieldError field="descLarga" />
                </div>


                {activeTab !== 'senales' && (
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>
                      {activeTab === 'tendencias'
                        ? <><span>lógica de la tendencia</span> <em style={{ fontSize: 10, opacity: 0.7 }}>(Why now?)</em></>
                        : 'lógica del escenario'
                      }{activeTab === 'escenarios' && <span style={{ color: '#ef4444' }}> *</span>}
                    </label>
                    <textarea
                      rows={activeTab === 'escenarios' ? 4 : 3}
                      value={createForm.logica}
                      onChange={e => { setCreateForm(f => ({ ...f, logica: e.target.value })); setFieldErrors(fe => ({ ...fe, logica: undefined })); }}
                      placeholder={activeTab === 'tendencias'
                        ? 'Explique el razonamiento subyacente y por qué es relevante ahora...'
                        : 'Explicación de la lógica causal que lleva a este escenario...'
                      }
                      className={`${inputCls} resize-none ${fieldErrors.logica ? 'border-red-400' : ''}`}
                    />
                    <FieldError field="logica" />
                  </div>
                )}
              </div>
            </div>


            <div className={`pb-6 border-b ${themeColors.cardBorder}`}>
              <SectionTitle icon="perm_media" title="Multimedia y Fuentes" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>
                    {activeTab === 'escenarios' ? 'fuente del escenario' : `fuente de la ${tabSingular.toLowerCase()}`}
                    {activeTab === 'senales' && <span style={{ color: '#ef4444' }}> *</span>}
                  </label>
                  <input type="text" value={createForm.fuente}
                    onChange={e => { setCreateForm(f => ({ ...f, fuente: e.target.value })); setFieldErrors(fe => ({ ...fe, fuente: undefined })); }}
                    placeholder="Ej. Forbes, TechCrunch, Nature"
                    className={`${inputCls} ${fieldErrors.fuente ? 'border-red-400 focus:ring-red-300/30' : ''}`} />
                  <FieldError field="fuente" />
                </div>
                {activeTab === 'escenarios' ? (
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>
                      urls de la fuente
                    </label>
                    {createForm.urlFuentesEscenario.map((u, i) => (
                      <div key={i} className="flex items-center gap-2 mb-2">
                        <input type="url" value={u}
                          onChange={e => {
                            const arr = [...createForm.urlFuentesEscenario];
                            arr[i] = e.target.value;
                            setCreateForm(f => ({ ...f, urlFuentesEscenario: arr }));
                            setFieldErrors(fe => ({ ...fe, [`urlFuenteEsc_${i}`]: undefined }));
                          }}
                          placeholder="https://..."
                          className={`${inputCls} flex-1 ${fieldErrors[`urlFuenteEsc_${i}`] ? 'border-red-400 focus:ring-red-300/30' : ''}`} />
                        {createForm.urlFuentesEscenario.length > 1 && (
                          <button type="button"
                            onClick={() => setCreateForm(f => ({ ...f, urlFuentesEscenario: f.urlFuentesEscenario.filter((_, j) => j !== i) }))}
                            className="p-1.5 rounded hover:bg-red-50 transition-colors" style={{ color: '#ef4444' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>remove_circle</span>
                          </button>
                        )}
                        {fieldErrors[`urlFuenteEsc_${i}`] && (
                          <span className="text-xs" style={{ color: '#ef4444' }}>{fieldErrors[`urlFuenteEsc_${i}`]}</span>
                        )}
                      </div>
                    ))}
                    <button type="button"
                      onClick={() => setCreateForm(f => ({ ...f, urlFuentesEscenario: [...f.urlFuentesEscenario, ''] }))}
                      className="flex items-center gap-1 text-xs font-medium mt-1 hover:underline" style={{ color: '#1978e5' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add_circle</span>
                      Agregar otra URL
                    </button>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>
                      url de la fuente{activeTab === 'senales' && <span style={{ color: '#ef4444' }}> *</span>}
                    </label>
                    <input type="url" value={createForm.urlFuente}
                      onChange={e => { setCreateForm(f => ({ ...f, urlFuente: e.target.value })); setFieldErrors(fe => ({ ...fe, urlFuente: undefined })); }}
                      placeholder="https://..."
                      className={`${inputCls} ${fieldErrors.urlFuente ? 'border-red-400 focus:ring-red-300/30' : ''}`} />
                    <FieldError field="urlFuente" />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>
                    url imagen
                  </label>
                  <input type="url" value={createForm.imagenUrl}
                    onChange={e => { setCreateForm(f => ({ ...f, imagenUrl: e.target.value })); setFieldErrors(fe => ({ ...fe, imagenUrl: undefined })); }}
                    placeholder="https://... (jpg, png, webp)"
                    className={`${inputCls} ${fieldErrors.imagenUrl ? 'border-red-400 focus:ring-red-300/30' : ''}`} />
                  <FieldError field="imagenUrl" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>url video (opcional)</label>
                  <input type="url" value={createForm.videoUrl}
                    onChange={e => setCreateForm(f => ({ ...f, videoUrl: e.target.value }))}
                    placeholder="YouTube, Vimeo..."
                    className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>autor (opcional)</label>
                  <input type="text" value={createForm.autor}
                    onChange={e => setCreateForm(f => ({ ...f, autor: e.target.value }))}
                    placeholder="Nombre del autor del artículo"
                    className={inputCls} />
                </div>
              </div>
            </div>


            <div className={`pb-6 border-b ${themeColors.cardBorder}`}>
              <SectionTitle icon="hub" title="Relaciones Estratégicas" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">


                  {activeTab === 'senales' && (<>

                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>tendencias relacionadas</label>
                      <div className={`rounded-lg border p-2 min-h-[44px] ${themeColors.inputBg} ${themeColors.inputBorder} focus-within:ring-2 focus-within:ring-blue-400/30`}>
                        <div className="flex flex-wrap gap-1.5 mb-1">
                          {tendenciasRel.map(r => (
                            <span key={r.uuid} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                              style={{ backgroundColor: '#1978e520', color: '#1978e5', border: '1px solid #1978e540' }}>
                              {r.titulo}
                              <button type="button" onClick={() => setTendenciasRel(prev => prev.filter(x => x.uuid !== r.uuid))} className="hover:opacity-70">
                                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>close</span>
                              </button>
                            </span>
                          ))}
                        </div>
                        <div className="relative">
                          <input type="text" value={tendSearch}
                            onChange={e => { setTendSearch(e.target.value); searchRelaciones(e.target.value, tendTimerRef, 'tendencias', setTendResults, setTendShowDrop); }}
                            onFocus={() => tendSearch && setTendShowDrop(true)}
                            onBlur={() => setTimeout(() => setTendShowDrop(false), 200)}
                            placeholder="Buscar tendencia..."
                            className={`w-full text-sm bg-transparent outline-none py-0.5 ${themeColors.inputText}`}
                            style={{ fontSize: 13 }} />
                          {tendShowDrop && tendResults.filter(r => !tendenciasRel.some(x => x.uuid === r.uuid)).length > 0 && (
                            <div className={`absolute z-20 left-0 right-0 top-full mt-1 rounded-lg border shadow-lg max-h-40 overflow-y-auto ${themeColors.cardBg} ${themeColors.cardBorder}`}>
                              {tendResults.filter(r => !tendenciasRel.some(x => x.uuid === r.uuid)).map(r => (
                                <button key={r.uuid} type="button"
                                  onMouseDown={() => { setTendenciasRel(prev => [...prev, r]); setTendSearch(''); setTendResults([]); setTendShowDrop(false); }}
                                  className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors ${themeColors.text}`}>
                                  {r.titulo}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="text-[10px] mt-1" style={{ color: '#94a3b8' }}>Busque y seleccione tendencias para vincular.</p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>escenarios relacionados</label>
                      <div className={`rounded-lg border p-2 min-h-[44px] ${themeColors.inputBg} ${themeColors.inputBorder} focus-within:ring-2 focus-within:ring-blue-400/30`}>
                        <div className="flex flex-wrap gap-1.5 mb-1">
                          {escenariosRel.map(r => (
                            <span key={r.uuid} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                              style={{ backgroundColor: '#0099CC20', color: '#0099CC', border: '1px solid #0099CC40' }}>
                              {r.titulo}
                              <button type="button" onClick={() => setEscenariosRel(prev => prev.filter(x => x.uuid !== r.uuid))} className="hover:opacity-70">
                                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>close</span>
                              </button>
                            </span>
                          ))}
                        </div>
                        <div className="relative">
                          <input type="text" value={escSearch}
                            onChange={e => { setEscSearch(e.target.value); searchRelaciones(e.target.value, escTimerRef, 'escenarios', setEscResults, setEscShowDrop); }}
                            onFocus={() => escSearch && setEscShowDrop(true)}
                            onBlur={() => setTimeout(() => setEscShowDrop(false), 200)}
                            placeholder="Buscar escenario..."
                            className={`w-full text-sm bg-transparent outline-none py-0.5 ${themeColors.inputText}`}
                            style={{ fontSize: 13 }} />
                          {escShowDrop && escResults.filter(r => !escenariosRel.some(x => x.uuid === r.uuid)).length > 0 && (
                            <div className={`absolute z-20 left-0 right-0 top-full mt-1 rounded-lg border shadow-lg max-h-40 overflow-y-auto ${themeColors.cardBg} ${themeColors.cardBorder}`}>
                              {escResults.filter(r => !escenariosRel.some(x => x.uuid === r.uuid)).map(r => (
                                <button key={r.uuid} type="button"
                                  onMouseDown={() => { setEscenariosRel(prev => [...prev, r]); setEscSearch(''); setEscResults([]); setEscShowDrop(false); }}
                                  className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors ${themeColors.text}`}>
                                  {r.titulo}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="text-[10px] mt-1" style={{ color: '#94a3b8' }}>Busque y seleccione escenarios para vincular.</p>
                    </div>
                  </>)}


                  {activeTab === 'tendencias' && (<>

                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>señales relacionadas</label>
                      <div className={`rounded-lg border p-2 min-h-[44px] ${themeColors.inputBg} ${themeColors.inputBorder} focus-within:ring-2 focus-within:ring-blue-400/30`}>
                        <div className="flex flex-wrap gap-1.5 mb-1">
                          {senalesRel.map(r => (
                            <span key={r.uuid} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                              style={{ backgroundColor: '#7c3aed20', color: '#7c3aed', border: '1px solid #7c3aed40' }}>
                              {r.titulo}
                              <button type="button" onClick={() => setSenalesRel(prev => prev.filter(x => x.uuid !== r.uuid))} className="hover:opacity-70">
                                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>close</span>
                              </button>
                            </span>
                          ))}
                        </div>
                        <div className="relative">
                          <input type="text" value={senSearch}
                            onChange={e => { setSenSearch(e.target.value); searchRelaciones(e.target.value, senTimerRef, 'senales', setSenResults, setSenShowDrop); }}
                            onFocus={() => senSearch && setSenShowDrop(true)}
                            onBlur={() => setTimeout(() => setSenShowDrop(false), 200)}
                            placeholder="Buscar señal..."
                            className={`w-full text-sm bg-transparent outline-none py-0.5 ${themeColors.inputText}`}
                            style={{ fontSize: 13 }} />
                          {senShowDrop && senResults.filter(r => !senalesRel.some(x => x.uuid === r.uuid)).length > 0 && (
                            <div className={`absolute z-20 left-0 right-0 top-full mt-1 rounded-lg border shadow-lg max-h-40 overflow-y-auto ${themeColors.cardBg} ${themeColors.cardBorder}`}>
                              {senResults.filter(r => !senalesRel.some(x => x.uuid === r.uuid)).map(r => (
                                <button key={r.uuid} type="button"
                                  onMouseDown={() => { setSenalesRel(prev => [...prev, r]); setSenSearch(''); setSenResults([]); setSenShowDrop(false); }}
                                  className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors ${themeColors.text}`}>
                                  {r.titulo}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="text-[10px] mt-1" style={{ color: '#94a3b8' }}>Busque y seleccione señales para vincular.</p>
                    </div>


                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>escenarios relacionados</label>
                      <div className={`rounded-lg border p-2 min-h-[44px] ${themeColors.inputBg} ${themeColors.inputBorder} focus-within:ring-2 focus-within:ring-blue-400/30`}>
                        <div className="flex flex-wrap gap-1.5 mb-1">
                          {escenariosRel.map(r => (
                            <span key={r.uuid} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                              style={{ backgroundColor: '#0099CC20', color: '#0099CC', border: '1px solid #0099CC40' }}>
                              {r.titulo}
                              <button type="button" onClick={() => setEscenariosRel(prev => prev.filter(x => x.uuid !== r.uuid))} className="hover:opacity-70">
                                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>close</span>
                              </button>
                            </span>
                          ))}
                        </div>
                        <div className="relative">
                          <input
                            type="text"
                            value={escSearch}
                            onChange={e => { setEscSearch(e.target.value); searchRelaciones(e.target.value, escTimerRef, 'escenarios', setEscResults, setEscShowDrop); }}
                            onFocus={() => escSearch && setEscShowDrop(true)}
                            onBlur={() => setTimeout(() => setEscShowDrop(false), 200)}
                            placeholder="Buscar escenario..."
                            className={`w-full text-sm bg-transparent outline-none py-0.5 ${themeColors.inputText}`}
                            style={{ fontSize: 13 }}
                          />
                          {escShowDrop && escResults.filter(r => !escenariosRel.some(x => x.uuid === r.uuid)).length > 0 && (
                            <div className={`absolute z-20 left-0 right-0 top-full mt-1 rounded-lg border shadow-lg max-h-40 overflow-y-auto ${themeColors.cardBg} ${themeColors.cardBorder}`}>
                              {escResults
                                .filter(r => !escenariosRel.some(x => x.uuid === r.uuid))
                                .map(r => (
                                  <button key={r.uuid} type="button"
                                    onMouseDown={() => { setEscenariosRel(prev => [...prev, r]); setEscSearch(''); setEscResults([]); setEscShowDrop(false); }}
                                    className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors ${themeColors.text}`}>
                                    {r.titulo}
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="text-[10px] mt-1" style={{ color: '#94a3b8' }}>Busque y seleccione escenarios para vincular.</p>
                    </div>
                  </>)}


                  {activeTab === 'escenarios' && (<>

                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>señales relacionadas</label>
                      <div className={`rounded-lg border p-2 min-h-[44px] ${themeColors.inputBg} ${themeColors.inputBorder} focus-within:ring-2 focus-within:ring-blue-400/30`}>
                        <div className="flex flex-wrap gap-1.5 mb-1">
                          {senalesRel.map(r => (
                            <span key={r.uuid} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                              style={{ backgroundColor: '#7c3aed20', color: '#7c3aed', border: '1px solid #7c3aed40' }}>
                              {r.titulo}
                              <button type="button" onClick={() => setSenalesRel(prev => prev.filter(x => x.uuid !== r.uuid))} className="hover:opacity-70">
                                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>close</span>
                              </button>
                            </span>
                          ))}
                        </div>
                        <div className="relative">
                          <input
                            type="text"
                            value={senSearch}
                            onChange={e => { setSenSearch(e.target.value); searchRelaciones(e.target.value, senTimerRef, 'senales', setSenResults, setSenShowDrop); }}
                            onFocus={() => senSearch && setSenShowDrop(true)}
                            onBlur={() => setTimeout(() => setSenShowDrop(false), 200)}
                            placeholder="Buscar señal..."
                            className={`w-full text-sm bg-transparent outline-none py-0.5 ${themeColors.inputText}`}
                            style={{ fontSize: 13 }}
                          />
                          {senShowDrop && senResults.filter(r => !senalesRel.some(x => x.uuid === r.uuid)).length > 0 && (
                            <div className={`absolute z-20 left-0 right-0 top-full mt-1 rounded-lg border shadow-lg max-h-40 overflow-y-auto ${themeColors.cardBg} ${themeColors.cardBorder}`}>
                              {senResults
                                .filter(r => !senalesRel.some(x => x.uuid === r.uuid))
                                .map(r => (
                                  <button key={r.uuid} type="button"
                                    onMouseDown={() => { setSenalesRel(prev => [...prev, r]); setSenSearch(''); setSenResults([]); setSenShowDrop(false); }}
                                    className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors ${themeColors.text}`}>
                                    {r.titulo}
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="text-[10px] mt-1" style={{ color: '#94a3b8' }}>Busque y seleccione señales para vincular.</p>
                    </div>


                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>tendencias relacionadas</label>
                      <div className={`rounded-lg border p-2 min-h-[44px] ${themeColors.inputBg} ${themeColors.inputBorder} focus-within:ring-2 focus-within:ring-blue-400/30`}>
                        <div className="flex flex-wrap gap-1.5 mb-1">
                          {tendenciasRel.map(r => (
                            <span key={r.uuid} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                              style={{ backgroundColor: '#1978e520', color: '#1978e5', border: '1px solid #1978e540' }}>
                              {r.titulo}
                              <button type="button" onClick={() => setTendenciasRel(prev => prev.filter(x => x.uuid !== r.uuid))} className="hover:opacity-70">
                                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>close</span>
                              </button>
                            </span>
                          ))}
                        </div>
                        <div className="relative">
                          <input
                            type="text"
                            value={tendSearch}
                            onChange={e => { setTendSearch(e.target.value); searchRelaciones(e.target.value, tendTimerRef, 'tendencias', setTendResults, setTendShowDrop); }}
                            onFocus={() => tendSearch && setTendShowDrop(true)}
                            onBlur={() => setTimeout(() => setTendShowDrop(false), 200)}
                            placeholder="Buscar tendencia..."
                            className={`w-full text-sm bg-transparent outline-none py-0.5 ${themeColors.inputText}`}
                            style={{ fontSize: 13 }}
                          />
                          {tendShowDrop && tendResults.filter(r => !tendenciasRel.some(x => x.uuid === r.uuid)).length > 0 && (
                            <div className={`absolute z-20 left-0 right-0 top-full mt-1 rounded-lg border shadow-lg max-h-40 overflow-y-auto ${themeColors.cardBg} ${themeColors.cardBorder}`}>
                              {tendResults
                                .filter(r => !tendenciasRel.some(x => x.uuid === r.uuid))
                                .map(r => (
                                  <button key={r.uuid} type="button"
                                    onMouseDown={() => { setTendenciasRel(prev => [...prev, r]); setTendSearch(''); setTendResults([]); setTendShowDrop(false); }}
                                    className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors ${themeColors.text}`}>
                                    {r.titulo}
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="text-[10px] mt-1" style={{ color: '#94a3b8' }}>Busque y seleccione tendencias para vincular.</p>
                    </div>
                  </>)}
                </div>
            </div>


            {createError && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-lg" style={{ backgroundColor: '#fef2f2', color: '#dc2626' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>error</span>
                <span className="text-sm font-medium">{createError}</span>
              </div>
            )}


            <div className={`flex items-center justify-end gap-3 pt-4 border-t ${themeColors.cardBorder}`}>
              <button
                type="button"
                onClick={() => { setShowCreate(false); setEditMode(false); setEditId(null); }}
                disabled={creating}
                className="px-5 py-2.5 rounded-lg border text-sm font-medium transition-colors"
                style={{ borderColor: '#e5e7eb', color: '#6b7280' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f9fafb')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="px-6 py-2.5 rounded-lg text-white text-sm font-medium shadow-sm hover:shadow-md transition-all flex items-center gap-2 active:scale-95 disabled:opacity-60"
                style={{ backgroundColor: '#1978e5' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1462c2')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#1978e5')}
              >
                {creating
                  ? <Loader2 size={16} className="animate-spin" />
                  : <span className="material-symbols-outlined" style={{ fontSize: 18 }}>save</span>
                }
                {creating ? 'GUARDANDO...' : editMode ? `ACTUALIZAR ${tabSingular.toUpperCase()}` : `GUARDAR ${tabSingular.toUpperCase()}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6">


      {/*----------------reorg Gestion----------------*/}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className={`text-2xl md:text-3xl font-bold mb-2 ${themeColors.headerText}`}>
            Radar
          </h1>
          <p style={{ color: '#6b7280', fontSize: 14 }}>
            Supervisa, valida y gestiona señales, tendencias y escenarios para la toma de decisiones
          </p>
        </div>
        <button
          type="button"
          onClick={volverASeleccion}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all active:scale-95 flex-shrink-0"
          style={{ borderColor: '#cbd5e1', color: isDark ? '#e2e8f0' : '#334155', background: isDark ? '#0f172a' : 'transparent' }}
        >
          Volver a Gestion
        </button>
      </div>

      <input ref={relInputRef} type="file" accept=".xlsx,.xls" onChange={handleImportRelaciones} className="hidden" />
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" />


      {importResult && (
        <div className={`flex items-start justify-between gap-3 px-4 py-3 rounded-xl border text-sm font-medium ${
          importResult.errors.length > 0 && importResult.imported === 0
            ? 'border-red-200 bg-red-50 text-red-800'
            : importResult.errors.length > 0
            ? 'border-amber-200 bg-amber-50 text-amber-800'
            : 'border-emerald-200 bg-emerald-50 text-emerald-800'
        }`}>
          <div className="flex-1 min-w-0">
            <p className="font-semibold">
              {(() => {
                const s = activeTab === 'tendencias' ? 'tendencia' : activeTab === 'escenarios' ? 'escenario' : 'señal';
                const sp = activeTab === 'tendencias' ? 'tendencias' : activeTab === 'escenarios' ? 'escenarios' : 'señales';
                return importResult.imported > 0
                  ? `✓ ${importResult.imported} ${importResult.imported !== 1 ? sp : s} importada${activeTab !== 'senales' ? (importResult.imported !== 1 ? 's' : '') : (importResult.imported !== 1 ? 's' : '')} de ${importResult.total}`
                  : `✗ No se importó ningún ${s}`;
              })()}
              {importResult.errors.length > 0 && ` · ${importResult.errors.length} error${importResult.errors.length !== 1 ? 'es' : ''}`}
              {(importResult.warnings?.length ?? 0) > 0 && ` · ${importResult.warnings!.length} aviso${importResult.warnings!.length !== 1 ? 's' : ''}`}
            </p>
            {importResult.errors.length > 0 && (
              <ul className="mt-1.5 space-y-0.5 text-xs opacity-80" style={{ maxHeight: 300, overflowY: 'auto' }}>
                {importResult.errors.map((e, i) => (
                  <li key={i}>{e.fila > 0 ? `Fila ${e.fila}: ` : ''}{e.error}</li>
                ))}
              </ul>
            )}
            {(importResult.warnings?.length ?? 0) > 0 && (
              <ul className="mt-1.5 space-y-0.5 text-xs opacity-70" style={{ maxHeight: 200, overflowY: 'auto' }}>
                {importResult.warnings!.map((w, i) => (
                  <li key={i}>⚠ Fila {w.fila}: {w.aviso}</li>
                ))}
              </ul>
            )}
          </div>
          <button
            onClick={() => setImportResult(null)}
            className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>
      )}


      {/*----------------reorg Gestion----------------*/}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div className={`inline-flex p-1 rounded-xl shadow-sm border ${themeColors.cardBg} ${themeColors.cardBorder}`}>
          {RADAR_TABS.map(tab => {
            const isImportar = tab === 'importar';
            const isActive   = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => switchTab(tab)}
                className={`px-5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  isActive ? 'text-white shadow-sm' : `opacity-60 hover:opacity-90 ${themeColors.text}`
                }`}
                style={isActive ? { background: isImportar ? '#7c3aed' : '#0099CC' } : undefined}
              >
                {isImportar && (
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>auto_awesome</span>
                )}
                {TAB_CONFIG[tab].label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => relInputRef.current?.click()}
            disabled={importingRel}
            title="Importar relaciones entre señales, tendencias y escenarios"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium border transition-all active:scale-95 disabled:opacity-50"
            style={{ borderColor: '#2A9D8F', color: '#2A9D8F', background: 'transparent' }}
          >
            {importingRel
              ? <Loader2 size={14} className="animate-spin" />
              : <span className="material-symbols-outlined" style={{ fontSize: 15 }}>hub</span>
            }
            {importingRel ? 'IMPORTANDO...' : 'IMPORTAR RELACIONES'}
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium border transition-all active:scale-95 disabled:opacity-50"
            style={{ borderColor: '#1978e5', color: '#1978e5', background: 'transparent' }}
          >
            {importing
              ? <Loader2 size={14} className="animate-spin" />
              : <span className="material-symbols-outlined" style={{ fontSize: 15 }}>upload_file</span>
            }
            {importing ? 'IMPORTANDO...' : 'IMPORTAR EXCEL'}
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-xs font-medium shadow-sm transition-all active:scale-95 hover:shadow-md"
            style={{ backgroundColor: '#1978e5' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1462c2')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#1978e5')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>add</span>
            {TAB_CONFIG[activeTab as keyof typeof TAB_CONFIG]?.nueva?.toUpperCase()}
          </button>
        </div>
      </div>


      <div
        className={`rounded-xl shadow-sm border transition-colors duration-200 ${themeColors.cardBg} ${themeColors.cardBorder}`}
        style={{ paddingBottom: openMenu ? 128 : 0 }}
      >

        <div className={`px-6 py-3 border-b ${themeColors.cardBorder} flex flex-col sm:flex-row sm:flex-wrap gap-2`}>
          <div className="relative flex-1 max-w-sm">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2"
              style={{ fontSize: 17, color: '#9ca3af' }}>search</span>
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Explorar prospectiva..."
              className={`w-full pl-9 pr-3 py-2 text-sm rounded-full outline-none border transition-all ${themeColors.inputBg} ${themeColors.inputBorder} ${themeColors.inputText}`}
              style={{ fontSize: 13 }}
            />
          </div>
          <select
            value={estadoFilter}
            onChange={e => { setEstadoFilter(e.target.value); setPage(1); }}
            className={`px-3 py-2 text-sm rounded-full border outline-none transition-all ${themeColors.inputBg} ${themeColors.inputBorder} ${themeColors.inputText}`}
            style={{ fontSize: 13 }}
          >
            <option value="">Todos los estados</option>
            <option value="publicado">Publicado</option>
            <option value="revision">En revisión</option>
            <option value="borrador">Borrador</option>
            <option value="archivado">Papelera / Archivados</option>
          </select>


          <div ref={pestelFiltRef} className="relative">
            <button
              onClick={() => { setPestelFiltOpen(v => !v); setSectorFiltOpen(false); }}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-full border outline-none transition-all ${themeColors.inputBg} ${themeColors.inputBorder} ${themeColors.inputText}`}
              style={{ fontSize: 13 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>category</span>
              PESTEL
              {pestelFilter.length > 0 && (
                <span className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full text-white" style={{ backgroundColor: '#1978e5' }}>
                  {pestelFilter.length}
                </span>
              )}
            </button>
            {pestelFiltOpen && (
              <div className={`absolute top-10 left-0 z-50 w-52 rounded-xl shadow-xl border overflow-hidden ${themeColors.cardBg} ${themeColors.cardBorder}`}>
                <div className="px-3 py-2 border-b text-xs font-semibold" style={{ borderColor: 'inherit', color: '#6b7280' }}>
                  Filtrar por PESTEL
                </div>
                <div className="max-h-52 overflow-y-auto py-1">
                  {pestels.map(p => {
                    const pid = String(p.id_pestel);
                    const sel = pestelFilter.includes(pid);
                    return (
                      <label key={pid} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-black/5 transition-colors">
                        <input
                          type="checkbox"
                          checked={sel}
                          onChange={() => {
                            setPestelFilter(prev => sel ? prev.filter(x => x !== pid) : [...prev, pid]);
                            setPage(1);
                          }}
                          className="rounded"
                        />
                        <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
                          style={{ backgroundColor: p.color }}>
                          {p.letra_codigo}
                        </span>
                        <span className="text-xs font-medium truncate" style={{ color: p.color }}>{p.nombre_pestel}</span>
                      </label>
                    );
                  })}
                </div>
                {pestelFilter.length > 0 && (
                  <div className="px-3 py-2 border-t" style={{ borderColor: 'inherit' }}>
                    <button onClick={() => { setPestelFilter([]); setPage(1); }}
                      className="text-xs font-semibold" style={{ color: '#ef4444' }}>
                      Limpiar filtro
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>


          <div ref={sectorFiltRef} className="relative">
            <button
              onClick={() => { setSectorFiltOpen(v => !v); setPestelFiltOpen(false); }}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-full border outline-none transition-all ${themeColors.inputBg} ${themeColors.inputBorder} ${themeColors.inputText}`}
              style={{ fontSize: 13 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>domain</span>
              Sector
              {sectorFilter.length > 0 && (
                <span className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full text-white" style={{ backgroundColor: '#1978e5' }}>
                  {sectorFilter.length}
                </span>
              )}
            </button>
            {sectorFiltOpen && (
              <div className={`absolute top-10 left-0 z-50 w-64 rounded-xl shadow-xl border overflow-hidden ${themeColors.cardBg} ${themeColors.cardBorder}`}>
                <div className="px-3 py-2 border-b text-xs font-semibold" style={{ borderColor: 'inherit', color: '#6b7280' }}>
                  Filtrar por Sector
                </div>
                <div className="max-h-56 overflow-y-auto py-1">
                  {sectors.map(s => {
                    const sel = sectorFilter.includes(s.id_sector);
                    return (
                      <label key={s.id_sector} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-black/5 transition-colors">
                        <input
                          type="checkbox"
                          checked={sel}
                          onChange={() => {
                            setSectorFilter(prev => sel ? prev.filter(x => x !== s.id_sector) : [...prev, s.id_sector]);
                            setPage(1);
                          }}
                          className="rounded"
                        />
                        <span className="text-xs font-medium truncate">{s.nombre_sector}</span>
                      </label>
                    );
                  })}
                </div>
                {sectorFilter.length > 0 && (
                  <div className="px-3 py-2 border-t" style={{ borderColor: 'inherit' }}>
                    <button onClick={() => { setSectorFilter([]); setPage(1); }}
                      className="text-xs font-semibold" style={{ color: '#ef4444' }}>
                      Limpiar filtro
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {pageData && pageData.data.length > 0 && (
            <button onClick={handleExportListadoExcel} disabled={exportingListado}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-full border outline-none transition-all sm:ml-auto disabled:opacity-60"
              style={{ fontSize: 13, background: '#1978e5', color: '#fff', borderColor: '#1978e5' }}>
              {exportingListado
                ? <Loader2 size={14} className="animate-spin" />
                : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>download</span>
              }
              {exportingListado ? 'Exportando…' : 'Exportar Excel'}
            </button>
          )}

        </div>

        {exportError && (
          <div className="px-6 py-2 text-xs font-semibold" style={{ color: '#ef4444' }}>
            {exportError}
          </div>
        )}


        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={26} className="animate-spin" style={{ color: '#1978e5' }} />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4 gap-3">
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#fca5a5' }}>error_outline</span>
            <p className="text-sm font-semibold" style={{ color: '#ef4444' }}>{error}</p>
            <button onClick={fetchData}
              className="px-4 py-2 rounded-lg text-xs font-bold text-white"
              style={{ backgroundColor: '#1978e5' }}>
              Reintentar
            </button>
          </div>
        ) : !pageData || pageData.data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4 gap-2">
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#cbd5e1' }}>inbox</span>
            <p className="text-sm font-medium" style={{ color: '#94a3b8' }}>
              No se encontraron {TAB_CONFIG[activeTab].label.toLowerCase()}.
            </p>
            {(search || estadoFilter || pestelFilter.length > 0 || sectorFilter.length > 0) && (
              <button onClick={() => { setSearch(''); setEstadoFilter(''); setPestelFilter([]); setSectorFilter([]); setPage(1); }}
                className="text-xs font-semibold mt-1" style={{ color: '#1978e5' }}>
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <>

            <div className="overflow-visible">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className={`text-xs uppercase font-semibold tracking-wider ${themeColors.tableHeaderBg}`}
                    style={{ color: '#9ca3af' }}>
                    <th className="px-6 py-4">
                      {activeTab === 'senales' ? 'Señal' : activeTab === 'tendencias' ? 'Tendencia' : 'Escenario'}
                    </th>
                    <th className="px-6 py-4">Sector</th>
                    <th className="px-6 py-4">Pestel</th>
                    <th className="px-6 py-4">Fuente</th>
                    <th className="px-6 py-4">Fecha de Actualización</th>
                    <th className="px-6 py-4">Estado</th>
                    <th className="px-6 py-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${themeColors.cardBorder}`}>
                  {pageData.data.map(item => {
                    const badge       = ESTADO_BADGE[item.estado.slug] || ESTADO_BADGE.borrador;
                    const av          = avatarColors(item.pestelColor);
                    const transitions = ESTADO_TRANSITIONS[item.estado.slug] || [];
                    const isChanging  = changingId === item.uuid;
                    const menuOpen    = openMenu === item.uuid;
                    const showArchiveCountdown = estadoFilter === 'archivado' && item.idEstado === 4;

                    const rowHover = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)';
                    const rowMenuBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(249,250,251,0.9)';
                    return (
                      <tr
                        key={item.uuid}
                        className={`group transition-colors ${menuOpen ? 'relative z-10' : 'z-0'}`}
                        style={menuOpen ? { backgroundColor: rowMenuBg } : {}}
                        onMouseEnter={e => { if (!menuOpen) (e.currentTarget as HTMLElement).style.backgroundColor = rowHover; }}
                        onMouseLeave={e => { if (!menuOpen) (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
                      >

                        <td className="px-6 py-4" style={{ maxWidth: 280 }}>
                          <div className="flex items-start gap-4">
                            <div
                              className="mt-1 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: av.bg, color: av.text }}
                            >
                              {activeTab === 'senales' ? <Zap size={18} /> : activeTab === 'tendencias' ? <Activity size={18} /> : <Eye size={18} />}
                            </div>
                            <div className="min-w-0">
                              <h4
                                className={`text-sm font-bold mb-1 group-hover:text-blue-600 transition-colors ${themeColors.headerText}`}
                                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              >
                                {item.titulo}
                              </h4>
                              {item.topico && (
                                <div className="flex items-center gap-1 mb-1">
                                  <span className="material-symbols-outlined" style={{ fontSize: 12, color: '#9ca3af' }}>label</span>
                                  <span className="text-xs" style={{ color: '#9ca3af' }}>{item.topico}</span>
                                </div>
                              )}
                              <p
                                className="text-xs leading-relaxed"
                                style={{
                                  color: '#9ca3af',
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                  overflow: 'hidden',
                                }}
                              >
                                {item.descripcion || '—'}
                              </p>
                            </div>
                          </div>
                        </td>


                        <td className="px-6 py-4" style={{ width: 160, maxWidth: 160 }}>
                          {item.sectors && item.sectors.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {item.sectors.map(s => (
                                <span
                                  key={s}
                                  className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                                  style={{
                                    backgroundColor: isDark ? 'rgba(59,130,246,0.2)' : '#dbeafe',
                                    color: isDark ? '#93c5fd' : '#1e40af',
                                    maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block'
                                  }}
                                  title={s}
                                >
                                  {s}
                                </span>
                              ))}
                            </div>
                          ) : <span style={{ color: '#cbd5e1', fontSize: 13 }}>—</span>}
                        </td>


                        <td className="px-6 py-4">
                          {item.pestels && item.pestels.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {[...item.pestels]
                                .sort((a, b) => ['P','E','S','T','Ec','L'].indexOf(a.letra) - ['P','E','S','T','Ec','L'].indexOf(b.letra))
                                .map(p => (
                                <span
                                  key={p.letra}
                                  className="inline-flex items-center px-1.5 py-0.5 rounded font-semibold"
                                  style={{
                                    backgroundColor: p.color + '1a',
                                    color: p.color,
                                    border: `1px solid ${p.color}44`,
                                    fontSize: 'clamp(8px, 0.65vw, 11px)',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {p.nombre}
                                </span>
                              ))}
                            </div>
                          ) : <span style={{ color: '#cbd5e1', fontSize: 13 }}>—</span>}
                        </td>


                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className={`text-sm font-bold ${themeColors.headerText}`}>
                              {item.fuente || '—'}
                            </span>
                            {item.urlFuente && (
                              <a
                                href={item.urlFuente}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 mt-0.5 text-xs hover:underline"
                                style={{ color: '#3b82f6', fontSize: 11 }}
                              >
                                <span
                                  className="material-symbols-outlined"
                                  style={{ fontSize: 11, transform: 'rotate(315deg)', display: 'inline-block' }}
                                >link</span>
                                Ver Evidencia
                              </a>
                            )}
                          </div>
                        </td>


                        <td className="px-6 py-4 text-sm" style={{ color: '#9ca3af', whiteSpace: 'nowrap' }}>
                          {item.fecha
                            ? new Date(item.fecha).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
                            : '—'}
                        </td>


                        <td className="px-6 py-4">
                          <span
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                            style={{
                              backgroundColor: isDark ? badge.text + '22' : badge.bg,
                              color: isDark ? badge.text.replace('#065f46','#34d399').replace('#9a3412','#fb923c').replace('#475569','#94a3b8') : badge.text
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{badge.icon}</span>
                            {item.estado.label.toUpperCase()}
                          </span>
                          {showArchiveCountdown && (
                            <span
                              className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                              style={{
                                backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#fef2f2',
                                color: '#dc2626',
                                border: '1px solid rgba(239,68,68,0.28)',
                                whiteSpace: 'nowrap',
                              }}
                              title={item.fechaArchivado ? `Archivado el ${new Date(item.fechaArchivado).toLocaleDateString('es-PE')}` : undefined}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>timer</span>
                              {item.diasArchivoRestantes === 0
                                ? 'Se eliminará pronto'
                                : `Se elimina en ${item.diasArchivoRestantes ?? item.diasArchivoRetencion ?? 30} días`}
                            </span>
                          )}
                        </td>


                        <td className="px-6 py-4 text-center relative">
                          <div className="flex items-center justify-center gap-2">


                            <button
                              className="p-1.5 rounded-full transition-colors"
                              style={{ color: '#1978e5' }}
                              title="Ver detalle"
                              onClick={() => handleVerDetalle(item)}
                              onMouseEnter={e => (e.currentTarget.style.backgroundColor = isDark ? 'rgba(59,130,246,0.15)' : '#eff6ff')}
                              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>visibility</span>
                            </button>


                            {isChanging ? (
                              <div className="p-1.5">
                                <Loader2 size={18} className="animate-spin" style={{ color: '#94a3b8' }} />
                              </div>
                            ) : (
                              <div
                                className="relative"
                                ref={el => { menuRefs.current[item.uuid] = el; }}
                              >
                                <button
                                  onClick={() => setOpenMenu(menuOpen ? null : item.uuid)}
                                  className="p-1.5 rounded-full transition-colors focus:outline-none"
                                  style={{
                                    color:           menuOpen ? '#4b5563' : '#9ca3af',
                                    backgroundColor: menuOpen ? '#f3f4f6' : 'transparent',
                                  }}
                                  title="Más acciones"
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>more_vert</span>
                                </button>

                                {menuOpen && (
                                  <div
                                    className={`absolute right-0 mt-2 w-40 rounded-md shadow-lg border overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200 ${themeColors.cardBg}`}
                                    style={{
                                      borderColor: '#f3f4f6',
                                      boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
                                      outline: '1px solid rgba(0,0,0,0.05)',
                                    }}
                                  >

                                    <button
                                      onClick={() => openEdit(item)}
                                      className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors text-left ${themeColors.text}`}
                                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f9fafb')}
                                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                                    >
                                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#6b7280' }}>edit</span>
                                      <span className="font-medium">Editar</span>
                                    </button>


                                    {transitions.map(t => (
                                      <button
                                        key={t.id}
                                        onClick={() => handleEstadoChange(item, t.id)}
                                        className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors text-left ${themeColors.text}`}
                                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f9fafb')}
                                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                                      >
                                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#1978e5' }}>{t.icon}</span>
                                        <span className="font-medium">{t.label}</span>
                                      </button>
                                    ))}

                                    {item.idEstado !== 4 && (<>

                                      <div style={{ height: 1, backgroundColor: '#f3f4f6', margin: '2px 0' }} />


                                      <button
                                        onClick={() => { setOpenMenu(null); setArchiveTarget(item); setArchiveError(null); }}
                                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors text-left"
                                        style={{ color: '#6b7280' }}
                                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#fef2f2'; e.currentTarget.style.color = '#dc2626'; }}
                                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = ''; e.currentTarget.style.color = '#6b7280'; }}
                                      >
                                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>inventory_2</span>
                                        <span className="font-medium">Archivar</span>
                                      </button>
                                    </>)}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>


            <div
              className={`px-6 py-4 border-t ${themeColors.cardBorder} ${themeColors.cardBg} flex flex-col sm:flex-row items-center justify-between gap-3`}
            >
              <div className="text-xs" style={{ color: '#6b7280' }}>
                Mostrando{' '}
                <span className={`font-medium ${themeColors.headerText}`}>
                  {(currentPage - 1) * PAGE_LIMIT + 1}
                </span>{' '}a{' '}
                <span className={`font-medium ${themeColors.headerText}`}>
                  {Math.min(currentPage * PAGE_LIMIT, pageData.total)}
                </span>{' '}de{' '}
                <span className={`font-medium ${themeColors.headerText}`}>{pageData.total}</span>{' '}
                resultados
              </div>

              <div className="flex gap-1.5">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1 text-xs font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ color: '#6b7280' }}
                  onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                >
                  Anterior
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                  .reduce<(number | '...')[]>((acc, p, i, arr) => {
                    if (i > 0 && typeof arr[i - 1] === 'number' && (p as number) - (arr[i - 1] as number) > 1)
                      acc.push('...');
                    acc.push(p); return acc;
                  }, [])
                  .map((p, i) =>
                    p === '...' ? (
                      <span key={`e${i}`} className="px-2 text-xs flex items-center" style={{ color: '#9ca3af' }}>…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p as number)}
                        className="px-3 py-1 text-xs font-medium rounded shadow-sm transition-colors"
                        style={p === currentPage
                          ? { backgroundColor: '#1978e5', color: '#ffffff' }
                          : { color: '#374151' }}
                        onMouseEnter={e => { if (p !== currentPage) e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
                        onMouseLeave={e => { if (p !== currentPage) e.currentTarget.style.backgroundColor = ''; }}
                      >
                        {p}
                      </button>
                    )
                  )}

                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1 text-xs font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ color: '#6b7280' }}
                  onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                >
                  Siguiente
                </button>
              </div>
            </div>
          </>
        )}
      </div>


      {archiveTarget && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(17,24,33,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget && !archiving) { setArchiveTarget(null); setArchiveError(null); } }}
        >
          <div className={`w-full max-w-md rounded-2xl shadow-2xl border animate-in zoom-in-95 duration-200 ${themeColors.cardBg} ${themeColors.cardBorder}`}>


            <div className={`px-6 py-5 border-b ${themeColors.cardBorder} flex items-center gap-3`}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: '#fef2f2' }}>
                <span className="material-symbols-outlined" style={{ color: '#dc2626', fontSize: 22 }}>inventory_2</span>
              </div>
              <div>
                <h3 className={`text-base font-bold ${themeColors.headerText}`}>Archivar {activeTab === 'tendencias' ? 'tendencia' : activeTab === 'senales' ? 'señal' : 'escenario'}</h3>
                <p className="text-xs" style={{ color: '#9ca3af' }}>Esta acción retira el registro del listado activo</p>
              </div>
            </div>


            <div className="px-6 py-5">
              <p className="text-sm" style={{ color: '#6b7280' }}>
                ¿Confirmas que deseas archivar{' '}
                <strong className={themeColors.headerText}>"{archiveTarget.titulo}"</strong>?
              </p>
              <p className="text-xs mt-2" style={{ color: '#94a3b8' }}>
                Quedará registrado en el historial de auditoría y no aparecerá en el listado activo.
              </p>
              {archiveError && (
                <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg"
                  style={{ backgroundColor: '#fef2f2', color: '#dc2626' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>error</span>
                  <span className="text-xs font-medium">{archiveError}</span>
                </div>
              )}
            </div>


            <div
              className={`px-6 py-4 border-t ${themeColors.cardBorder} flex items-center justify-end gap-3 rounded-b-2xl`}
              style={{ backgroundColor: 'rgba(249,250,251,0.5)' }}
            >
              <button
                onClick={() => { setArchiveTarget(null); setArchiveError(null); }}
                disabled={archiving}
                className="px-5 py-2 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50"
                style={{ borderColor: '#e5e7eb', color: '#6b7280' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f9fafb')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
              >
                Cancelar
              </button>
              <button
                onClick={handleArchivar}
                disabled={archiving}
                className="px-5 py-2 rounded-lg text-white text-sm font-medium flex items-center gap-2 transition-all active:scale-95 disabled:opacity-60"
                style={{ backgroundColor: '#dc2626' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#b91c1c')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#dc2626')}
              >
                {archiving
                  ? <Loader2 size={14} className="animate-spin" />
                  : <span className="material-symbols-outlined" style={{ fontSize: 16 }}>inventory_2</span>
                }
                {archiving ? 'Archivando...' : 'Sí, archivar'}
              </button>
            </div>
          </div>
        </div>
      )}


      {selectedItem && (() => {
        const item     = selectedItem;
        const detail   = selectedDetail;
        const badge    = ESTADO_BADGE[item.estado.slug] || ESTADO_BADGE.borrador;
        const trans    = ESTADO_TRANSITIONS[item.estado.slug] || [];
        const isChg    = changingId === item.uuid;
        const tabLabel = activeTab === 'senales' ? 'señal' : activeTab === 'tendencias' ? 'tendencia' : 'escenario';
        const tabIcon  = activeTab === 'tendencias' ? 'trending_up' : activeTab === 'escenarios' ? 'landscape' : 'psychology';
        const closeModal = () => { setSelectedItem(null); setSelectedDetail(null); };

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(17,24,33,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
          >
            <div className={`relative w-full max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col rounded-2xl shadow-2xl border animate-in zoom-in-95 duration-200 ${themeColors.cardBg} ${themeColors.cardBorder}`}>


              <button
                onClick={closeModal}
                className="absolute top-4 right-4 z-10 p-2 rounded-full transition-colors"
                style={{ color: '#9ca3af' }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = isDark ? 'rgba(255,255,255,0.08)' : '#f3f4f6'; e.currentTarget.style.color = isDark ? '#e5e7eb' : '#374151'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = ''; e.currentTarget.style.color = '#9ca3af'; }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
              </button>


              <div
                className={`px-8 py-6 border-b ${themeColors.cardBorder} flex items-start gap-3`}
                style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(249,250,251,0.7)' }}
              >
                <div className="w-11 h-11 rounded-full flex-shrink-0 flex items-center justify-center"
                  style={{ backgroundColor: item.pestelColor + '22', color: item.pestelColor }}>
                  {activeTab === 'senales' ? <Zap size={20} /> : activeTab === 'tendencias' ? <Activity size={20} /> : <Eye size={20} />}
                </div>
                <div>
                  <h3 className="text-xl font-bold flex items-center gap-2" style={{ color: '#1978e5' }}>
                    {detail?.id ? `ID: #T-${String(detail.id).padStart(3, '0')} · ` : ''}
                    {item.titulo}
                    <span className="material-symbols-outlined text-base"
                      style={{ color: '#9ca3af', cursor: 'help', fontSize: 18 }}
                      title={`${tabLabel.charAt(0).toUpperCase() + tabLabel.slice(1)} estratégica`}>info</span>
                  </h3>
                  <p className="text-sm mt-0.5" style={{ color: '#9ca3af' }}>
                    Detalle completo de la {tabLabel} estratégica
                  </p>
                </div>
              </div>


              <div className="p-8 space-y-8 flex-1">


                <section>
                  <h4 className="text-xs font-semibold uppercase tracking-wider mb-4 pb-2"
                    style={{ color: '#9ca3af', borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9'}` }}>
                    Información General
                  </h4>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">


                    <div className="lg:col-span-2 space-y-4">
                      <div>
                        <span className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>
                          {activeTab === 'escenarios' ? 'Nombre del Escenario' : 'Nombre'}
                        </span>
                        <div className={`text-lg font-semibold ${themeColors.headerText}`}>{detail?.nombre || item.titulo}</div>
                      </div>
                      {detail?.tituloDes && detail.tituloDes !== (detail?.nombre || item.titulo) && (
                        <div>
                          <span className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>
                            {activeTab === 'escenarios' ? 'Título del Escenario' : 'Título Descriptivo'}
                          </span>
                          <div className={`text-base font-medium ${themeColors.headerText}`}>{detail.tituloDes}</div>
                        </div>
                      )}
                      <div>
                        <span className="block text-xs font-medium mb-2" style={{ color: '#9ca3af' }}>Descripción</span>
                        <p className="text-sm leading-relaxed" style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>
                          {item.descripcion || '—'}
                        </p>
                      </div>


                      {detailLoading && !detail && (
                        <div className="flex items-center gap-2 py-3" style={{ color: '#9ca3af' }}>
                          <Loader2 size={14} className="animate-spin" />
                          <span className="text-xs">Cargando detalle completo...</span>
                        </div>
                      )}
                      {detail?.descLarga && (
                        <div>
                          <button
                            onClick={() => setShowDescLargaDetail(v => !v)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
                            style={{ background: showDescLargaDetail ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.06)', color: '#6366f1', border: '1.5px solid rgba(99,102,241,0.25)' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>description</span>
                            {showDescLargaDetail ? 'Ocultar descripción larga' : 'Ver descripción larga'}
                          </button>
                          {showDescLargaDetail && (
                            <div className="mt-3">
                              <div
                                className="prose prose-sm max-w-none text-sm leading-relaxed"
                                style={{ color: isDark ? '#9ca3af' : '#6b7280' }}
                                dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(detail.descLarga) }}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>


                    <div className="space-y-6">
                      <div>
                        <span className="block text-xs font-medium mb-2" style={{ color: '#9ca3af' }}>Clasificación</span>
                        <div className="flex flex-col gap-3">
                          {item.sector && (
                            <div>
                              <span className="text-xs block mb-1" style={{ color: '#9ca3af' }}>Sector</span>
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border"
                                style={{ backgroundColor: isDark ? 'rgba(29,78,216,0.15)' : '#eff6ff', color: isDark ? '#93c5fd' : '#1d4ed8', borderColor: isDark ? 'rgba(147,197,253,0.3)' : '#bfdbfe' }}>
                                {item.sector}
                              </span>
                            </div>
                          )}
                          {item.pestel && (
                            <div>
                              <span className="text-xs block mb-1" style={{ color: '#9ca3af' }}>PESTEL</span>
                              <span className="inline-flex items-center px-3 py-1 rounded border text-sm font-semibold uppercase tracking-wide"
                                style={{ borderColor: item.pestelColor, color: item.pestelColor }}>
                                {item.pestel}
                              </span>
                            </div>
                          )}
                          <div>
                            <span className="text-xs block mb-1" style={{ color: '#9ca3af' }}>Estado actual</span>
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                              style={{ backgroundColor: badge.bg, color: badge.text }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{badge.icon}</span>
                              {item.estado.label.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      </div>

                      {(item.fuente || item.urlFuente || (activeTab === 'escenarios' && detail?.urlFuentes?.length)) && (
                        <div className="p-4 rounded-lg border"
                          style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(249,250,251,0.8)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb' }}>
                          <span className="block text-xs font-medium mb-2" style={{ color: '#9ca3af' }}>Fuente Original</span>
                          {item.fuente && (
                            <div className="flex items-center gap-2 mb-2">
                              <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#9ca3af' }}>article</span>
                              <span className={`font-semibold text-sm ${themeColors.headerText}`}>{item.fuente}</span>
                            </div>
                          )}
                          {activeTab === 'escenarios' && detail?.urlFuentes?.length ? (
                            <div className="flex flex-col gap-1">
                              {detail.urlFuentes.map((u, i) => (
                                <a key={i} href={u} target="_blank" rel="noopener noreferrer"
                                  className="text-xs flex items-center gap-1 hover:underline" style={{ color: '#1978e5' }}>
                                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>open_in_new</span>
                                  {u.length > 60 ? u.slice(0, 57) + '…' : u}
                                </a>
                              ))}
                            </div>
                          ) : (
                            item.urlFuente && (
                              <a href={item.urlFuente} target="_blank" rel="noopener noreferrer"
                                className="text-xs flex items-center gap-1 hover:underline" style={{ color: '#1978e5' }}>
                                Visitar fuente
                                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>open_in_new</span>
                              </a>
                            )
                          )}
                        </div>
                      )}


                      {activeTab === 'senales' && detail?.fechaSeñalArticulo && (
                        <div>
                          <span className="text-xs block mb-1" style={{ color: '#9ca3af' }}>Fecha del Artículo</span>
                          <div className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#9ca3af' }}>calendar_today</span>
                            <span className={`text-sm font-medium ${themeColors.headerText}`}>{detail.fechaSeñalArticulo}</span>
                          </div>
                        </div>
                      )}

                      {detail?.topico && (
                        <div>
                          <span className="text-xs block mb-1" style={{ color: '#9ca3af' }}>Tópico</span>
                          <div className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#9ca3af' }}>label</span>
                            <span className={`text-sm font-medium ${themeColors.headerText}`}>{detail.topico}</span>
                          </div>
                        </div>
                      )}

                      {activeTab === 'tendencias' && detail?.topicosRelacionados && detail.topicosRelacionados.length > 0 && (
                        <div>
                          <span className="text-xs block mb-1" style={{ color: '#9ca3af' }}>Tópicos relacionados</span>
                          <div className="flex flex-wrap gap-1">
                            {detail.topicosRelacionados.map(t => (
                              <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                                style={{ backgroundColor: isDark ? 'rgba(34,197,94,0.1)' : '#f0fdf4', color: isDark ? '#4ade80' : '#166534' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 11 }}>label</span>
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {activeTab === 'escenarios' && detail?.probabilidad != null && (
                        <div>
                          <span className="text-xs block mb-1" style={{ color: '#9ca3af' }}>Probabilidad</span>
                          <div className="flex items-center gap-1.5">
                            {[1,2,3,4,5].map(i => (
                              <span key={i} style={{
                                display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                                background: i <= (detail.probabilidad ?? 0) ? '#6366f1' : 'rgba(99,102,241,0.18)',
                                border: `1.5px solid ${i <= (detail.probabilidad ?? 0) ? '#6366f1' : 'rgba(99,102,241,0.3)'}`,
                              }} />
                            ))}
                            <span className="text-xs font-bold ml-1" style={{ color: '#6366f1' }}>{detail.probabilidad}/5</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </section>


                {(detail?.imagenUrl || detail?.videoUrl) && (
                  <section>
                    <h4 className="text-xs font-semibold uppercase tracking-wider mb-4 pb-2"
                      style={{ color: '#9ca3af', borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9'}` }}>
                      Multimedia y Evidencia
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {detail.imagenUrl && (
                        <div className="p-4 rounded-lg border col-span-full md:col-span-1"
                          style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(249,250,251,0.8)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb' }}>
                          <span className="block text-sm font-medium mb-2" style={{ color: isDark ? '#e5e7eb' : '#374151' }}>Evidencia Visual</span>
                          <img
                            src={detail.imagenUrl}
                            alt="Evidencia visual"
                            className="w-full rounded-lg object-cover mb-2"
                            style={{ maxHeight: 220 }}
                            onError={e => {
                              const el = e.currentTarget;
                              el.style.display = 'none';
                              el.nextElementSibling?.removeAttribute('hidden');
                            }}
                          />
                          <span hidden className="text-xs italic" style={{ color: '#9ca3af' }}>No se pudo cargar la imagen</span>
                          <a href={detail.imagenUrl} target="_blank" rel="noopener noreferrer"
                            className="text-xs hover:underline flex items-center gap-1" style={{ color: '#1978e5' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>open_in_new</span>
                            Abrir en nueva pestaña
                          </a>
                        </div>
                      )}
                      {detail.videoUrl && (
                        <div className="flex items-center gap-4 p-4 rounded-lg border"
                          style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(249,250,251,0.8)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb' }}>
                          <div className="w-16 h-16 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9', color: '#94a3b8' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 28 }}>play_circle</span>
                          </div>
                          <div className="min-w-0">
                            <span className="block text-sm font-medium mb-1" style={{ color: isDark ? '#e5e7eb' : '#374151' }}>
                              {activeTab === 'escenarios' ? 'Video de Escenario' : 'Video Demo'}
                            </span>
                            <a href={detail.videoUrl} target="_blank" rel="noopener noreferrer"
                              className="text-sm break-all hover:underline" style={{ color: '#1978e5' }}>
                              {detail.videoUrl.split('/').pop() || 'Ver video'}
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
                )}


                {(() => {
                  const showSenales    = (detail?.senalesRelacionadas?.length ?? 0) > 0;
                  const isEscenarios   = activeTab === 'escenarios';
                  const secondList     = isEscenarios ? detail?.tendenciasRelacionadas : detail?.escenariosRelacionados;
                  const showSecond     = (secondList?.length ?? 0) > 0;
                  if (!showSenales && !showSecond) return null;
                  return (
                    <section>
                      <h4 className="text-xs font-semibold uppercase tracking-wider mb-4 pb-2"
                        style={{ color: '#9ca3af', borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9'}` }}>
                        Relaciones Estratégicas
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {showSenales && (
                          <div className={`px-4 py-4 rounded-lg border shadow-sm ${themeColors.cardBg} ${themeColors.cardBorder}`}>
                            <div className="flex items-center gap-2 mb-3">
                              <span className="material-symbols-outlined p-1.5 rounded-md"
                                style={{ color: '#a855f7', backgroundColor: 'rgba(168,85,247,0.1)', fontSize: 16 }}>psychology</span>
                              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#9ca3af' }}>
                                Señales Relacionadas
                              </span>
                            </div>
                            <div className="flex flex-col gap-2">
                              {detail!.senalesRelacionadas!.map(s => (
                                <div key={s.uuid}
                                  className="flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium"
                                  style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(249,250,251,0.8)', color: isDark ? '#e5e7eb' : '#374151' }}>
                                  <span>{s.titulo}</span>
                                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#9ca3af' }}>arrow_forward</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {showSecond && (
                          <div className={`px-4 py-4 rounded-lg border shadow-sm ${themeColors.cardBg} ${themeColors.cardBorder}`}>
                            <div className="flex items-center gap-2 mb-3">
                              <span className="material-symbols-outlined p-1.5 rounded-md"
                                style={{
                                  color:           isEscenarios ? '#0d9488' : '#0d9488',
                                  backgroundColor: 'rgba(13,148,136,0.1)',
                                  fontSize:        16,
                                }}>
                                {isEscenarios ? 'trending_up' : 'auto_awesome'}
                              </span>
                              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#9ca3af' }}>
                                {isEscenarios ? 'Tendencias Relacionadas' : 'Escenarios Relacionados'}
                              </span>
                            </div>
                            <div className="flex flex-col gap-2">
                              {secondList!.map(r => (
                                <div key={r.uuid}
                                  className="flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium"
                                  style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(249,250,251,0.8)', color: isDark ? '#e5e7eb' : '#374151' }}>
                                  <span>{r.titulo}</span>
                                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#9ca3af' }}>arrow_forward</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </section>
                  );
                })()}


                {(item.fecha || detail?.creadoPor) && (
                  <div className="text-[11px] font-medium px-2 py-1 rounded-md inline-block"
                    style={{ color: '#9ca3af', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(249,250,251,0.8)' }}>
                    {item.fecha && (
                      <>Creado el:{' '}
                        {new Date(item.fecha).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </>
                    )}
                    {item.fecha && detail?.creadoPor && <span className="mx-1" style={{ color: isDark ? 'rgba(255,255,255,0.2)' : '#e5e7eb' }}>|</span>}
                    {detail?.creadoPor && <>Por: {detail.creadoPor}</>}
                  </div>
                )}
              </div>


              <div
                className={`px-8 py-5 border-t ${themeColors.cardBorder} flex items-center justify-between rounded-b-2xl gap-3`}
                style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(249,250,251,0.7)' }}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  {isChg ? (
                    <Loader2 size={20} className="animate-spin" style={{ color: '#94a3b8' }} />
                  ) : (
                    trans.map(t => (
                      <button key={t.id} onClick={() => handleEstadoChange(item, t.id)}
                        className="px-4 py-2.5 rounded-lg border font-medium transition-colors flex items-center gap-2 text-sm"
                        style={{
                          borderColor:     t.id === 1 ? '#6ee7b7' : t.id === 2 ? '#fed7aa' : '#e5e7eb',
                          backgroundColor: t.id === 1 ? '#ecfdf5' : t.id === 2 ? '#fff7ed' : '#f9fafb',
                          color:           t.id === 1 ? '#065f46' : t.id === 2 ? '#9a3412' : '#4b5563',
                        }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{t.icon}</span>
                        {t.label.toUpperCase()}
                      </button>
                    ))
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setArchiveTarget(item); setArchiveError(null); }}
                    className="px-5 py-2.5 rounded-lg border font-medium transition-colors flex items-center gap-2 text-sm"
                    style={{ borderColor: '#fecaca', backgroundColor: '#fef2f2', color: '#dc2626' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#fee2e2')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#fef2f2')}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>inventory_2</span>
                    ARCHIVAR
                  </button>
                  {item.estado.slug !== 'publicado' && (
                    <button onClick={() => handleEstadoChange(item, 1)} disabled={isChg}
                      className="px-6 py-2.5 rounded-lg text-white font-medium shadow-md hover:shadow-lg transition-all flex items-center gap-2 text-sm active:scale-95 disabled:opacity-60"
                      style={{ backgroundColor: '#1978e5' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1462c2')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#1978e5')}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check_circle</span>
                      PUBLICAR EN RADAR
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default GestionView;
