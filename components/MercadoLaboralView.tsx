import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  Database,
  Download,
  FileText,
  GraduationCap,
  Image,
  Lightbulb,
  LineChart,
  Loader2,
  Network,
  Search,
  Target,
  Wrench,
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { ThemeColors } from '../types';
import { logActividad } from '../services/actividadService';


interface InformeLaboralEntry {
  facultad: string;
  carrera: string;
  urlInformeCompleto: string;
  urlInfografia: string;
}

const INFORMES_LABORALES: InformeLaboralEntry[] = [
  { facultad: 'FACULTAD DE ADMINISTRACIÓN HOTELERA, TURISMO Y GASTRONOMÍA', carrera: 'ADMINISTRACIÓN HOTELERA',                                   urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQAgehST4rttSY7yUlaAFHYrAaZE1Lmht2x3IIU33sCP4gM?e=pOd6aP', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQDhgsFlk9ouS48l8NCuLRfMASaILdcX4Lg-qKfpkNP49pI?e=r5lFIP' },
  { facultad: 'FACULTAD DE ADMINISTRACIÓN HOTELERA, TURISMO Y GASTRONOMÍA', carrera: 'ARTE CULINARIO',                                             urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQADrxvKT3qpTJPTEAFGAoXwATjBgBqCr96PCC1r0vVioGY?e=RMAm41', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQCb7jXBzNsUTKwWu9NHAx4rAf79o2Gk60fgy8Hvail9TJ8?e=XymoPd' },
  { facultad: 'FACULTAD DE ADMINISTRACIÓN HOTELERA, TURISMO Y GASTRONOMÍA', carrera: 'GESTIÓN E INNOVACIÓN EN GASTRONOMÍA',                        urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQDELAMRW8w0Rp7jmAoVD9FwAYz7-nEvqa1jeOZP-5thYh8?e=RHblWY', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQDNkJNZNoZKQaHYSIS3MoJ0AY7PCEaF0KvRXW5Mia1_zGU?e=R3Su7K' },
  { facultad: 'FACULTAD DE ARQUITECTURA',                                    carrera: 'ARQUITECTURA, URBANISMO Y TERRITORIO',                        urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQCjn3Fp10LCRZGD2zny-MgSAUXTSdbAJHXpVdlX-R806gQ?e=DxiLQn', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQAy7Us821AGTbWuDkdlSOF4ASXFadW-Yf4URpmZrjcSb70?e=lfkxs1' },
  { facultad: 'FACULTAD DE ARTES Y HUMANIDADES',                             carrera: 'ARTE Y DISEÑO EMPRESARIAL',                                   urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQBz58wjYMugQZolIjDdbOOBAei0LEPk69NmAellSZBp3ZI?e=pszlQY', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQChSGsQlyMNT5gNAzTQFYNQAX_vtAvb_TDkzlirbm3gVXQ?e=Nuelpn' },
  { facultad: 'FACULTAD DE ARTES Y HUMANIDADES',                             carrera: 'COMUNICACIÓN',                                               urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQAtqBxBt-gNT7_371LikE_mAYi2ANfThsegwZgjdGtlXqQ?e=3KXZwo', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQAaMXth_-nkRZmMZEYxC11zAabeifLQ5iQEovBWaxWfJqI?e=efHwiq' },
  { facultad: 'FACULTAD DE ARTES Y HUMANIDADES',                             carrera: 'MÚSICA',                                                     urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQCmsSoNujJ_SI6xjtPFZpjTAX5QblnTl2qO3CqncFq0lJg?e=4QfryE', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQDF7Pwc-MRNTJwnwvKpw7lbAVIxBOS6rzlo1yYSH7VtoUY?e=Y0y9xe' },
  { facultad: 'FACULTAD DE CIENCIAS DE LA SALUD',                            carrera: 'CIENCIAS DE LA ACTIVIDAD FÍSICA Y DEL DEPORTE',              urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQC-3F9yO0sgTYtYF5EDYzTAAdqHctLcieVrOGBo5760g7U?e=onIRcT', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQALkxnWz9x7Q68Jwk82BhEMATTgecJNXZ0rOzi3UkrTjEA?e=wb4dIE' },
  { facultad: 'FACULTAD DE CIENCIAS DE LA SALUD',                            carrera: 'ENFERMERÍA',                                                  urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQAyDhA_tSouSIHWEUDffF3CAV6zY_K51H28vdc_B8KVnyA?e=rMk4jq', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQDsrLXJRYxTTqxMB4LVsPqNAUOuzl0Lyf5ANdCjc7gNREQ?e=1fMwAf' },
  { facultad: 'FACULTAD DE CIENCIAS DE LA SALUD',                            carrera: 'MEDICINA HUMANA',                                             urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQAMKxxnG3DnQ40-g0wGCwhFAa1wWC00ZsRjsDdQ6h5uAA8?e=LvNsFI', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQBD9UGzAQP8RbG4Mfl764f2AfQOwx2jzQVXSO2pbWOu2Zs?e=WqCdDI' },
  { facultad: 'FACULTAD DE CIENCIAS DE LA SALUD',                            carrera: 'NUTRICIÓN Y DIETÉTICA',                                       urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQC55pG9S55TQbnBkHeUFdiDAWoRGUAuhGH07axUQAoA2lg?e=NiFHf2', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQCcCg3UA2GDQI3kC2DtNOy4AZK2dcat-eOmg1A-bmwts_A?e=ytDONC' },
  { facultad: 'FACULTAD DE CIENCIAS DE LA SALUD',                            carrera: 'PSICOLOGÍA',                                                  urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQAGPcL2ZC51R5E7avdgCP_IAW2mPUQ9X32JfN7xnVWW-os?e=2kM8V2', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQCqO5Z_Ks-US5L_aNuyMEMLAURDF7Q6UXsbruew_W0wjbM?e=e7UfMR' },
  { facultad: 'FACULTAD DE CIENCIAS DE LA SALUD',                            carrera: 'TECNOLOGÍA MÉDICA CON TERAPIA FÍSICA Y REHABILITACIÓN',       urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQBLgOK0lEoNTpyLQnKTgAh9AVR5TZB42trFYffjG1p1u6A?e=haH3ve', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQBZmayBzbO2QL3q2JpgAln8AWn_RbjFfdemnzeteyJ3Q2k?e=cDR3qg' },
  { facultad: 'FACULTAD DE CIENCIAS EMPRESARIALES',                          carrera: 'ADMINISTRACIÓN Y EMPRENDIMIENTO',                             urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQAVSgjzVqssQKhayoFj2f82AT-roWynvixhlpc5rEZe3eY?e=4H8LI1', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQDs6OfW7TgmQaXXIyxv2GyiAeD4oOOH4ORCUdylppDdk24?e=zzYKRz' },
  { facultad: 'FACULTAD DE CIENCIAS EMPRESARIALES',                          carrera: 'ADMINISTRACIÓN Y FINANZAS CORPORATIVAS',                      urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQD8UOXsT8B3QqThfbo1TwMFARMnCEoOm9tX6amW4rn9bnU?e=z9A3Tj', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQBImcFXjA6CTpAm8o-9LHG0AT-q_dztfz7Z0HFEnrAb3Js?e=zZsgc5' },
  { facultad: 'FACULTAD DE CIENCIAS EMPRESARIALES',                          carrera: 'ADMINISTRACIÓN',                                             urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQAAUNpcpQHZQqCdlmwVR49OATZoGlsH0cIRatIDF812rug?e=ytE3CI', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQDZJv84pyLlR7hylb6zgT7bAY0F5CDjhW5YBbSopd-SZkg?e=rf6I6o' },
  { facultad: 'FACULTAD DE CIENCIAS EMPRESARIALES',                          carrera: 'DIGITAL BUSINESS MANAGEMENT',                                 urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQDM6Bf2xrwQSYADC30aFu5bARQ4GL1L-tljUj2IuM10xa0?e=IUCHmV', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQDaMDUdxgxVSbOP9rOvKle1Adiit3lEJ-70_S-7JIXYhxY?e=sdunSz' },
  { facultad: 'FACULTAD DE CIENCIAS EMPRESARIALES',                          carrera: 'ECONOMÍA Y FINANZAS',                                         urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQDMkyPpeIE3QZOkOyt_XHOpAVkJsq6uNJMNLg2qpYY3a3Y?e=jhsfF2', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQDJKsh11EbpTrkQU59z9xvUAYM13cJBA5MC-7b7vOUUV8U?e=QoHQcy' },
  { facultad: 'FACULTAD DE CIENCIAS EMPRESARIALES',                          carrera: 'ECONOMÍA Y NEGOCIOS INTERNACIONALES',                         urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQD6sa1vctjWRb2FeQKJFmYTARNeD-cpWUtHWXgNbzYyJTY?e=LihtF9', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQDMZ4xkSi3JTLnwTW9oJnXiAb9B4OwIZt22tTv-t5H8RLI?e=OhJKoR' },
  { facultad: 'FACULTAD DE CIENCIAS EMPRESARIALES',                          carrera: 'INTERNATIONAL BUSINESS',                                      urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQDHraIqOzxFQYI1NvL3hlnyAfm9SaQyAgBkGoCILlRbMow?e=s56NJj', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQAVMD4_idsqS6Llx73ODS8oAbvoahPu60hAhkvUYBd6JmQ?e=e7AjUk' },
  { facultad: 'FACULTAD DE CIENCIAS EMPRESARIALES',                          carrera: 'MARKETING',                                                   urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQAvcfTyliutS4ew6QOMOXLHAQp4n37A3no425hhpJ2jHFU?e=aNtU3g', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQDzo0hLIyD9SJBVL5_-uNWwAQV6MQiYOMwGf-HRxAoMb_U?e=Ky1TO4' },
  { facultad: 'FACULTAD DE DERECHO',                                         carrera: 'DERECHO',                                                     urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQDweJASE0n9Sqvckx-ZfUKWAe69BQ73DbRy-rhmRSSSX6g?e=mF1fUN', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQARTh8T2VOjQrbjMfBK4WBuAarLJUUWtMsS_a4rfPP3eDs?e=KRadZA' },
  { facultad: 'FACULTAD DE DERECHO',                                         carrera: 'RELACIONES INTERNACIONALES',                                  urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQDx0WtvNyXlQb5-GjO59xxSAUc1CN6wBDDCVVYafwvqMVc?e=MmZCWX', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQBC6UFVm3B1S4JEkrjj9f0dAXMurVxWYda1DYW6HcvRU7o?e=k5abs0' },
  { facultad: 'FACULTAD DE EDUCACIÓN',                                       carrera: 'EDUCACIÓN INICIAL',                                           urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQDcPtSCsGWjRb3zmUU9G62eAdRvU432CiYnQNWHVI_joZw?e=pnnqRk', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQDe8hAl8iKTRJqF93UoONy5AcRW9IzhhZjLjFgNZpqnMwg?e=idK3hH' },
  { facultad: 'FACULTAD DE EDUCACIÓN',                                       carrera: 'EDUCACIÓN SECUNDARIA CON ESPECIALIDAD EN INGLÉS',             urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQCVX0LrNLolSaMcBfC2jYi1AV7IKAZK54OSTQia0ZcsBCE?e=Tacgix', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQByV167S94nS4M7ql5L9YkNAQzvofnM1qaT6KkOnwqrC6U?e=Yw50uQ' },
  { facultad: 'FACULTAD DE INGENIERÍA E INTELIGENCIA ARTIFICIAL',            carrera: 'CIENCIA DE DATOS',                                            urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQCzrWvKVWeURbm5GmVdojsYATOrws1qvRhYKHaHBG5rcCk?e=DxhOTL', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQAkFBo1VxH1QIfBu0JaQB8ZAYn2c3TR2b0dCD4PsDJoPZU?e=5zLjUa' },
  { facultad: 'FACULTAD DE INGENIERÍA E INTELIGENCIA ARTIFICIAL',            carrera: 'INGENIERÍA AGROINDUSTRIAL',                                   urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQDcnqbSuBIaSLt4MOOGoBFnAVritBLvzh6d-2YOklSmIJY?e=cckwJq', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQDf7nnqkPzZSZLrGxg3YWlcAWwX9JflgCfZNFfgm12KtlU?e=il6x30' },
  { facultad: 'FACULTAD DE INGENIERÍA E INTELIGENCIA ARTIFICIAL',            carrera: 'INGENIERÍA AMBIENTAL',                                        urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQA_pcam2XRMQpcQEw_rK8sSAUwRS5PrNPdIJJA4zryxyvc?e=WOmhbA', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQBGGCsVDm7EQouo5C5xQ_UOAZQZVrGKoh8-R427cmzUIWI?e=xKFXo6' },
  { facultad: 'FACULTAD DE INGENIERÍA E INTELIGENCIA ARTIFICIAL',            carrera: 'INGENIERÍA BIOMÉDICA',                                        urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQC-xEjBR_qjR5z2O1yKLDusAfFSpYOwxPbairElw2rwyUs?e=Sr1EEC', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQCOz0YZWGoPRoxY45qI8I2SAeKikJDQzc6fR7bFyRveuwc?e=06bcbO' },
  { facultad: 'FACULTAD DE INGENIERÍA E INTELIGENCIA ARTIFICIAL',            carrera: 'INGENIERÍA CIVIL',                                            urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQCJa7gQLguHSprYMpFb5aTJAapOE_D4i7diNS3VOJ0RX1I?e=UKwn8Q', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQAScTM1wN4MSIghS0VlEAojAVX7OOtSPbquww9dlpjE9G0?e=rCtdje' },
  { facultad: 'FACULTAD DE INGENIERÍA E INTELIGENCIA ARTIFICIAL',            carrera: 'INGENIERIA DE SISTEMAS DE INFORMACIÓN',                       urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQDDYP1QmbkERY-Htej9UtLqAQi8w2uoN4wkCTmI8Hmzb2c?e=4DdViB', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQC1NY7fW8gBTrOWMWe8VmOfAZl8w_Vz3tv7_f5nPNjmsKM?e=7v7NqA' },
  { facultad: 'FACULTAD DE INGENIERÍA E INTELIGENCIA ARTIFICIAL',            carrera: 'INGENIERÍA DE SOFTWARE',                                      urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQCP7qz2-NZDTIuRU8sLffLzARbwJfe4uLjdnrKb3tHSmiw?e=pjwm4j', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQBDacRNq3EHTbQqcWVglTZlAZvSx-8jWfmZSalcjygwYh0?e=wabhv5' },
  { facultad: 'FACULTAD DE INGENIERÍA E INTELIGENCIA ARTIFICIAL',            carrera: 'INGENIERÍA EMPRESARIAL',                                      urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQByE1vjs01HRrTlYa7eC38sAQL06EcJOCW_n8kGJNV3ZCs?e=g80IY8', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQBFQWrwcHudT5AgBj43Pu-8AYth3ssN7svWGNXoit7-qcQ?e=zPtBLa' },
  { facultad: 'FACULTAD DE INGENIERÍA E INTELIGENCIA ARTIFICIAL',            carrera: 'INGENIERÍA EN CIBERSEGURIDAD',                                urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQA__BqD2o2rTpkMrjORZ3d6AS1DcBFSZ_gd7n8Q5C8SIqI?e=ZucGCi', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQDWOk2zBwjgR7Qx0lDhy13NAXJb2FWqpELmJrZGIFu01r8?e=sQvNhP' },
  { facultad: 'FACULTAD DE INGENIERÍA E INTELIGENCIA ARTIFICIAL',            carrera: 'INGENIERÍA EN INDUSTRIAS ALIMENTARIAS',                       urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQBPZDHoybgDTLLfbNrao9TsAXlR329EQ728H8DipSHDqbQ?e=tNVPVe', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQB0UIsxMdgoQ4ySFCMaAOMyAX7Qdd5GXVVCpjmGWtec1DY?e=CnKT5c' },
  { facultad: 'FACULTAD DE INGENIERÍA E INTELIGENCIA ARTIFICIAL',            carrera: 'INGENIERÍA INDUSTRIAL Y COMERCIAL',                           urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQBa8a5o4iQbTaZUmlNuRf7EAa36O84RW8rgkLML7FlCPOg?e=LUhCfU', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQBp92D7CPEdTrTG2qGb64VfAQGuCHpb6oYVWCKOKKbwmlA?e=By9KJK' },
  { facultad: 'FACULTAD DE INGENIERÍA E INTELIGENCIA ARTIFICIAL',            carrera: 'INGENIERÍA MECATRÓNICA',                                      urlInformeCompleto: 'https://usiloffice365.sharepoint.com/:w:/s/ALUMNI475/IQBtE662uhlmRbU6Zei1Kr96AciEOtX1v2Xo3iiE1mWHhtw?e=klRbCM', urlInfografia: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQDlf9RgglSdQpBi5RZOm_jrAZoXvP_PJxXWHTAerTLHnWQ?e=UDgh6Z' },
];

function normalizeKey(s: string): string {
  return s.trim().toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

function findInformeLaboralEntry(facultad: string, carrera: string): InformeLaboralEntry | null {
  const nFac = normalizeKey(facultad);
  const nCar = normalizeKey(carrera);
  return INFORMES_LABORALES.find(
    e => normalizeKey(e.facultad) === nFac && normalizeKey(e.carrera) === nCar
  ) ?? null;
}

interface MercadoLaboralViewProps {
  themeColors: ThemeColors;
  userRole?: string;
}

interface FiltroFacultad {
  nombre: string;
  carreras: string[];
}

interface MetodoPaso {
  orden: number;
  titulo: string;
  descripcion: string;
}

interface InformeResponse {
  informe: {
    id: number;
    facultad: string;
    carrera: string;
    periodo: string;
    tituloHeader: string | null;
    descripcionHeader: string | null;
    insightHeader: string | null;
    descripcion: string | null;
    objetivoFinal: string | null;
    documentoInformeUrl: string | null;
  };
  mercado: {
    puestos: { orden: number; nombre: string; descripcion: string | null; vacantes: string | null }[];
    habilidades: { categoria: string; habilidades: string[] }[];
    herramientas: { orden: number; nombre: string; descripcion: string | null }[];
    tendencias: { orden: number; titulo: string; descripcion: string | null }[];
    recomendacionesEstudiante: string[];
    recomendacionesCurriculares: string[];
  };
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || `Error ${res.status}`);
  return data as T;
}

function SectionTitle({ n, title }: { n: number; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-3 border-b border-slate-200 pb-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#002D72] text-sm font-black text-white">
        {n}
      </span>
      <h2 className="text-sm font-black uppercase leading-tight tracking-wide text-[#002D72]">{title}</h2>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs font-semibold text-slate-500">{text}</p>;
}

function RecommendationBlock({ icon, title, items }: { icon: React.ReactNode; title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-blue-100 bg-slate-50 p-4">
      <div className="mb-3 flex items-center gap-3 text-[#002D72]">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#002D72] text-white">{icon}</span>
        <h3 className="text-sm font-black uppercase leading-tight">{title}</h3>
      </div>
      {items.length === 0 ? (
        <EmptyState text="Pendiente de curaduria" />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item} className="flex gap-2 text-xs font-semibold leading-relaxed text-slate-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#00A3E0]" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


const PASOS_FIJOS: MetodoPaso[] = [
  { orden: 1, titulo: 'Búsqueda Automatizada',   descripcion: 'Rastreo de miles de ofertas laborales en principales portales de empleo.' },
  { orden: 2, titulo: 'Recolección de Datos',    descripcion: 'Extracción y estructuración de la información de vacantes activas.' },
  { orden: 3, titulo: 'Procesamiento con IA',    descripcion: 'Procesamiento de lenguaje natural para limpiar y normalizar datos.' },
  { orden: 4, titulo: 'Identificación de Patrones', descripcion: 'Análisis semántico para agrupar habilidades y roles equivalentes.' },
  { orden: 5, titulo: 'Extracción de Insights',  descripcion: 'Generación de rankings de puestos, herramientas y competencias clave.' },
  { orden: 6, titulo: 'Aplicación Estratégica',  descripcion: 'Traducción de hallazgos del mercado en recomendaciones académicas.' },
];


const STEP_ICONS: Record<number, React.ReactNode> = {
  1: <Search        className="h-6 w-6" />,
  2: <Database      className="h-6 w-6" />,
  3: <Bot           className="h-6 w-6" />,
  4: <Network       className="h-6 w-6" />,
  5: <Lightbulb     className="h-6 w-6" />,
  6: <GraduationCap className="h-6 w-6" />,
};

const INSIGHTS = [
  { icon: <BriefcaseBusiness className="h-5 w-5" />, label: 'Puestos más demandados.' },
  { icon: <Lightbulb         className="h-5 w-5" />, label: 'Habilidades más solicitadas.' },
  { icon: <Wrench            className="h-5 w-5" />, label: 'Herramientas y conocimientos técnicos.' },
  { icon: <LineChart         className="h-5 w-5" />, label: 'Tendencias del mercado laboral.' },
  { icon: <BookOpen          className="h-5 w-5" />, label: 'Oportunidades de mejora curricular.' },
  { icon: <Target            className="h-5 w-5" />, label: 'Recomendaciones para empleabilidad.' },
];

const APLICACIONES = [
  'Actualización curricular.',
  'Diseño de experiencias formativas.',
  'Orientación a estudiantes y egresados.',
  'Fortalecimiento de competencias profesionales.',
  'Alineamiento con demandas del mercado.',
];

function MetodologiaView({ steps: _steps, onVerInformes }: { steps: MetodoPaso[]; onVerInformes: () => void }) {

  const steps = PASOS_FIJOS;
  return (
    <div className="space-y-6">

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-500">
          <span className="material-symbols-outlined text-[13px]">calendar_today</span>
          Periodo: Perú 2025 - 2026
        </div>
        <h1 className="mt-3 text-2xl font-black leading-tight text-[#002D72]">
          Análisis técnico del mercado laboral
        </h1>
        <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-slate-600">
          Herramienta de análisis para la toma de decisiones académicas, actualización curricular y fortalecimiento de la empleabilidad.
        </p>
      </div>


      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-xl font-black text-[#002D72]">¿Cómo se elaboraron los informes?</h2>
        <p className="mb-6 text-sm font-medium text-slate-500">
          Los informes fueron construidos mediante análisis automatizado de ofertas laborales, procesamiento con
          Inteligencia Artificial y extracción de patrones relevantes para la gestión académica.
        </p>

        <div className="flex flex-wrap items-start gap-2 lg:flex-nowrap">
          {steps.map((step, idx) => (
            <React.Fragment key={step.orden}>
              <div className="flex-1 min-w-[130px] rounded-xl border border-slate-100 bg-slate-50 p-4 relative">

                <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-[#00A3E0] text-[10px] font-black text-white">
                  {step.orden}
                </span>

                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-white text-[#002D72] shadow-sm border border-slate-100">
                  {STEP_ICONS[step.orden] ?? <BarChart3 className="h-5 w-5" />}
                </div>
                <h3 className="mb-1.5 text-[11px] font-black uppercase leading-tight tracking-wide text-[#002D72]">{step.titulo}</h3>
                <p className="text-[11px] font-medium leading-relaxed text-slate-500">{step.descripcion}</p>
              </div>
              {idx < steps.length - 1 && (
                <ArrowRight className="mt-6 h-5 w-5 shrink-0 text-slate-300 hidden lg:block" />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>


      <div className="grid gap-5 lg:grid-cols-2">


        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-2">
            <div className="h-6 w-1 rounded-full bg-[#00A3E0]" />
            <h2 className="text-lg font-black text-[#002D72]">Insights clave extraídos</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {INSIGHTS.map(({ icon, label }) => (
              <div key={label}
                className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#00A3E0] shadow-sm border border-slate-100">
                  {icon}
                </div>
                <span className="text-xs font-semibold leading-relaxed text-slate-700">{label}</span>
              </div>
            ))}
          </div>
        </div>


        <div className="rounded-2xl bg-[#002D72] p-6 text-white shadow-sm relative overflow-hidden">

          <GraduationCap className="absolute right-5 top-5 h-20 w-20 text-white/10" />
          <div className="mb-5 flex items-center gap-2">
            <div className="h-6 w-1 rounded-full bg-[#00A3E0]" />
            <h2 className="text-lg font-black text-white">Aplicación Académica Estratégica</h2>
          </div>
          <ul className="mb-6 space-y-3">
            {APLICACIONES.map((item) => (
              <li key={item} className="flex items-center gap-3 text-sm font-medium text-blue-100">
                <span className="flex h-2 w-2 shrink-0 rounded-full bg-[#00A3E0]" />
                {item}
              </li>
            ))}
          </ul>
          <button onClick={onVerInformes}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#00A3E0] px-5 py-3 text-sm font-black text-white shadow-md hover:bg-[#0091c7] transition-colors">
            Ver informes de mercado laboral <ArrowRight className="h-4 w-4" />
          </button>
        </div>

      </div>
    </div>
  );
}

function toTitleCase(str: string): string {
  const small = new Set(['de','del','y','e','o','a','con','en','la','el','los','las','por','para','al']);
  return str.toLowerCase().split(' ').map((w, i) =>
    (i === 0 || !small.has(w)) ? w.charAt(0).toUpperCase() + w.slice(1) : w
  ).join(' ');
}

function stripAccents(str: string): string {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function buildFiltrosFromExcel(): FiltroFacultad[] {
  const map = new Map<string, Set<string>>();
  INFORMES_LABORALES.forEach(e => {
    const fac = toTitleCase(e.facultad);
    if (!map.has(fac)) map.set(fac, new Set());
    map.get(fac)!.add(toTitleCase(e.carrera));
  });
  return [...map.entries()].sort((a,b) => a[0].localeCompare(b[0]))
    .map(([nombre, cs]) => ({ nombre, carreras: [...cs].sort() }));
}

function mergeFiltros(fromApi: FiltroFacultad[], fromExcel: FiltroFacultad[]): FiltroFacultad[] {
  const result = new Map<string, Set<string>>();
  [...fromApi, ...fromExcel].forEach(fac => {
    const normFac = stripAccents(fac.nombre);

    let existingKey: string | undefined;
    for (const k of result.keys()) {
      if (stripAccents(k) === normFac) { existingKey = k; break; }
    }
    const key = existingKey ?? fac.nombre;
    if (!result.has(key)) result.set(key, new Set());
    fac.carreras.forEach(c => {
      const normC = stripAccents(c);
      let found = false;
      for (const existing of result.get(key)!) {
        if (stripAccents(existing) === normC) { found = true; break; }
      }
      if (!found) result.get(key)!.add(c);
    });
  });
  return [...result.entries()].sort((a,b) => a[0].localeCompare(b[0]))
    .map(([nombre, cs]) => ({ nombre, carreras: [...cs].sort() }));
}

const MercadoLaboralView: React.FC<MercadoLaboralViewProps> = ({ themeColors, userRole }) => {
  type MercadoTab = 'informe' | 'metodologia';
  const validMercadoTabs: MercadoTab[] = ['informe', 'metodologia'];
  const [tab, setTab] = useState<MercadoTab>(() => {
    const stored = localStorage.getItem('radar_mercado_tab') as MercadoTab | null;
    return stored && validMercadoTabs.includes(stored) ? stored : 'metodologia';
  });
  const [facultades, setFacultades] = useState<FiltroFacultad[]>([]);
  const [facultad, setFacultad] = useState('');
  const [carrera, setCarrera] = useState('');
  const [informe, setInforme] = useState<InformeResponse | null>(null);
  const [metodologia, setMetodologia] = useState<MetodoPaso[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isDark = themeColors.bg?.includes('950') || themeColors.bg?.includes('slate-900') || false;


  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const exportBtnRef = useRef<HTMLDivElement>(null);
  const informeRef = useRef<HTMLDivElement>(null);
  const switchTab = (nextTab: MercadoTab) => {
    localStorage.setItem('radar_mercado_tab', nextTab);
    setTab(nextTab);
  };


  useEffect(() => {
    if (!exportOpen) return;
    const handler = (e: MouseEvent) => {
      if (exportBtnRef.current && !exportBtnRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [exportOpen]);

  const handleExport = async (tipo: 'imagen' | 'infografia' | 'informe_completo') => {
    setExportOpen(false);
    setExportMsg(null);

    if (!facultad || !carrera) {
      setExportMsg('Seleccione una facultad y carrera para exportar el informe.');
      return;
    }

    if (tipo === 'imagen') {
      if (!informeRef.current) return;
      setExporting(true);
      try {
        const canvas = await html2canvas(informeRef.current, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#f8fafc',
        });
        const link = document.createElement('a');
        link.download = `Informe_Mercado_Laboral_${carrera.replace(/\s+/g,'_')}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        logActividad('descargar_informe', {
          modulo: 'mercadoLaboral',
          elementoTipo: 'informe',
          elementoTitulo: carrera,
          metadata: { formato: 'png', facultad, carrera, tipo },
        });
      } catch {
        setExportMsg('Error al generar la imagen. Intente de nuevo.');
      } finally {
        setExporting(false);
      }
      return;
    }

    const entry = findInformeLaboralEntry(facultad, carrera);
    if (!entry) {
      setExportMsg('No se encontró un enlace para esta carrera.');
      return;
    }

    const url = tipo === 'infografia' ? entry.urlInfografia : entry.urlInformeCompleto;
    window.open(url, '_blank', 'noopener,noreferrer');
    logActividad('descargar_informe', {
      modulo: 'mercadoLaboral',
      elementoTipo: 'informe',
      elementoTitulo: carrera,
      metadata: { formato: 'externo', facultad, carrera, tipo, url },
    });
  };

  useEffect(() => {
    let alive = true;
    Promise.all([
      getJson<{ facultades: FiltroFacultad[] }>('/api/mercado-laboral/filtros'),
      getJson<{ data: MetodoPaso[] }>('/api/mercado-laboral/metodologia'),
    ])
      .then(([filters, metodo]) => {
        if (!alive) return;
        const excelFiltros = buildFiltrosFromExcel();
        setFacultades(mergeFiltros(filters.facultades, excelFiltros));
        setMetodologia(metodo.data);

      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!facultad || !carrera || tab !== 'informe') return;
    let alive = true;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ facultad, carrera }).toString();
    getJson<InformeResponse>(`/api/mercado-laboral/informe?${qs}`)
      .then((data) => alive && setInforme(data))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [facultad, carrera, tab]);

  const carreras = useMemo(
    () => facultades.find((f) => f.nombre === facultad)?.carreras ?? [],
    [facultades, facultad]
  );

  const handleFacultad = (value: string) => {
    setFacultad(value);
    setCarrera('');
    setInforme(null);
  };

  const bg = isDark ? '#0f172a' : '#f8fafc';

  if (error && !informe) {
    return (
      <div className="flex min-h-full items-center justify-center p-8" style={{ background: bg }}>
        <div className="max-w-md rounded-xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-full overflow-x-hidden p-4 md:p-6" style={{ background: bg }}>
      <div className="mx-auto max-w-[1500px] space-y-5">


        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: 'metodologia', label: 'Como se elaboraron', icon: Lightbulb },
            { key: 'informe',     label: 'Ver informes',        icon: Search },
          ].map((item) => {
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => switchTab(item.key as MercadoTab)}
                className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-black transition ${active ? 'bg-[#002D72] text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
          {loading && (
            <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando
            </span>
          )}
        </div>


        {(
          <>

            {tab === 'informe' && (
              <>
                <header className="rounded-xl border border-slate-200 bg-[#002D72] p-5 text-white shadow-sm">
                  <div className="grid gap-5 lg:grid-cols-[260px_1fr_320px] lg:items-center">
                    <div>
                      <h1 className="text-2xl font-black uppercase leading-tight tracking-wide text-[#00A3E0] md:text-3xl">
                        {informe?.informe.tituloHeader || 'Informes de Mercado Laboral'}
                      </h1>
                      <p className="mt-1 text-lg font-black uppercase text-white">{informe?.informe.periodo || 'Perú 2025 - 2026'}</p>
                      <div className="mt-3 h-1 w-20 rounded-full bg-[#00A3E0]" />
                    </div>
                    <p className="border-l border-white/20 pl-5 text-sm font-medium leading-relaxed text-blue-50">
                      {informe?.informe.descripcionHeader || 'Selecciona una facultad y una carrera para visualizar el análisis técnico correspondiente.'}
                    </p>
                    {informe?.informe.insightHeader && (
                      <div className="rounded-lg bg-white/10 p-4 text-sm font-black leading-snug text-blue-50">
                        <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#00A3E0]">
                          <BarChart3 className="h-5 w-5" />
                        </div>
                        {informe.informe.insightHeader}
                      </div>
                    )}
                  </div>
                </header>
                <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
                    <label className="block">
                      <span className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                        <span className="material-symbols-outlined text-[13px]">apartment</span> Facultad
                      </span>
                      <select value={facultad} onChange={(e) => handleFacultad(e.target.value)}
                        className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-[#002D72] outline-none">
                        <option value="">Selecciona una facultad...</option>
                        {facultades.map((f) => <option key={f.nombre} value={f.nombre}>{f.nombre}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                        <span className="material-symbols-outlined text-[13px]">school</span> Carrera
                      </span>
                      <select value={carrera} onChange={(e) => setCarrera(e.target.value)} disabled={!facultad}
                        className="h-11 w-full rounded-lg border border-cyan-300 bg-white px-3 text-sm font-bold text-[#002D72] outline-none disabled:opacity-50 disabled:cursor-not-allowed">
                        <option value="">Selecciona una carrera...</option>
                        {carreras.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>


                    <div className="flex flex-col gap-1">
                      <div ref={exportBtnRef} className="relative">
                        <button
                          onClick={() => { setExportMsg(null); setExportOpen(o => !o); }}
                          disabled={exporting}
                          className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#002D72] px-4 text-sm font-black text-white hover:bg-[#001f55] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {exporting
                            ? <><Loader2 className="h-4 w-4 animate-spin" /> Exportando…</>
                            : <><Download className="h-4 w-4" /> Exportar informe <ChevronDown className="h-3 w-3" /></>
                          }
                        </button>

                        {exportOpen && (
                          <div className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
                            {[
                              { tipo: 'imagen' as const,          icon: <Image className="h-4 w-4" />,    label: 'Imagen' },
                              { tipo: 'infografia' as const,      icon: <FileText className="h-4 w-4" />, label: 'Infografía' },
                              { tipo: 'informe_completo' as const, icon: <BookOpen className="h-4 w-4" />, label: 'Informe completo' },
                            ].map(({ tipo, icon, label }) => (
                              <button key={tipo}
                                onClick={() => handleExport(tipo)}
                                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                                <span className="text-[#002D72]">{icon}</span>
                                {label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {exportMsg && (
                        <p className="text-[11px] font-semibold text-amber-600 max-w-[200px] leading-snug">{exportMsg}</p>
                      )}
                    </div>
                  </div>
                </section>
              </>
            )}

            {tab === 'metodologia' ? (
              <MetodologiaView steps={metodologia} onVerInformes={() => switchTab('informe')} />
            ) : loading ? (
              <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-slate-200 bg-white py-16">
                <Loader2 className="h-8 w-8 animate-spin text-[#002D72]" />
                <p className="text-sm font-semibold text-slate-500">Cargando informe de mercado...</p>
              </div>
            ) : !informe ? (
              <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-slate-200 bg-white py-20 text-center shadow-sm">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#E0F4FD]">
                  <Lightbulb className="h-8 w-8 text-[#00A3E0]" />
                </div>
                <div>
                  <p className="text-base font-black text-[#002D72]">Selecciona una facultad y una carrera</p>
                  <p className="mt-1 max-w-xs text-xs font-medium leading-relaxed text-slate-400">
                    Utilice los selectores superiores para consultar el informe de mercado laboral y tendencias de una carrera específica.
                  </p>
                </div>
              </div>
            ) : (
              <div ref={informeRef}>
                <div className="grid gap-4 xl:grid-cols-4 xl:items-start">
                  <section className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <SectionTitle n={1} title="Top 5 de puestos mas frecuentes" />
                    <div className="flex-1 space-y-3 overflow-y-auto pr-1" style={{ maxHeight: '360px' }}>
                      {informe.mercado.puestos.map((puesto) => (
                        <div key={puesto.orden} className="flex gap-2 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#002D72] text-white">
                            <BriefcaseBusiness className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <h3 className="line-clamp-2 text-xs font-black leading-snug text-[#002D72]">{puesto.nombre}</h3>
                            {puesto.descripcion && <p className="mt-0.5 line-clamp-2 text-[11px] font-medium leading-snug text-slate-500">{puesto.descripcion}</p>}
                            {puesto.vacantes && <p className="mt-1 text-[10px] font-black uppercase text-[#00A3E0]">Aprox. {puesto.vacantes}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <SectionTitle n={2} title="Habilidades mas demandadas" />
                    <div className="flex-1 space-y-3 overflow-y-auto pr-1" style={{ maxHeight: '360px' }}>
                      {informe.mercado.habilidades.map((cat) => (
                        <div key={cat.categoria} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                          <div className="mb-1.5 flex items-center gap-2">
                            <GraduationCap className="h-4 w-4 shrink-0 text-[#002D72]" />
                            <h3 className="text-xs font-black leading-snug text-[#002D72]">{cat.categoria}</h3>
                          </div>
                          <ul className="list-disc space-y-0.5 pl-5 text-[11px] font-medium leading-snug text-slate-600">
                            {cat.habilidades.map((hab) => <li key={hab}>{hab}</li>)}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <SectionTitle n={3} title="Herramientas y conocimientos especificos" />
                    <div className="flex-1 space-y-3 overflow-y-auto pr-1" style={{ maxHeight: '360px' }}>
                      {informe.mercado.herramientas.map((herr) => (
                        <div key={`${herr.orden}-${herr.nombre}`} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                          <div className="mb-1 flex items-center gap-2">
                            <Wrench className="h-4 w-4 shrink-0 text-[#002D72]" />
                            <h3 className="text-xs font-black text-[#002D72]">{herr.nombre}</h3>
                          </div>
                          {herr.descripcion && <p className="line-clamp-3 pl-6 text-[11px] font-medium leading-snug text-slate-500">{herr.descripcion}</p>}
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <SectionTitle n={4} title="Tendencias y direccion del mercado" />
                    <div className="flex-1 space-y-3 overflow-y-auto pr-1" style={{ maxHeight: '360px' }}>
                      {informe.mercado.tendencias.map((tend) => (
                        <div key={`${tend.orden}-${tend.titulo}`} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                          <div className="mb-1 flex items-center gap-2">
                            <LineChart className="h-4 w-4 shrink-0 text-[#002D72]" />
                            <h3 className="text-xs font-black leading-snug text-[#002D72]">{tend.titulo}</h3>
                          </div>
                          {tend.descripcion && <p className="line-clamp-3 pl-6 text-[11px] font-medium leading-snug text-slate-600">{tend.descripcion}</p>}
                        </div>
                      ))}
                    </div>
                  </section>
                </div>

                <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
                  <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex items-center gap-3 border-b border-slate-100 p-4">
                      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#002D72] text-sm font-black text-white">5</span>
                      <h2 className="text-sm font-black uppercase tracking-wide text-[#002D72]">Sugerencia estrategica de empleabilidad</h2>
                    </div>
                    <div className="grid gap-4 p-5 md:grid-cols-2">
                      <RecommendationBlock icon={<GraduationCap className="h-6 w-6" />} title="Para estudiantes / egresados" items={informe.mercado.recomendacionesEstudiante} />
                      <RecommendationBlock icon={<BookOpen className="h-6 w-6" />} title="Para diseno curricular" items={informe.mercado.recomendacionesCurriculares} />
                    </div>
                  </section>

                  <aside className="rounded-xl bg-[#002D72] p-5 text-white shadow-sm">
                    <div className="mb-5 flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-[#00A3E0] text-[#00A3E0]">
                        <Target className="h-5 w-5" />
                      </span>
                      <div>
                        <h2 className="text-sm font-black uppercase tracking-wide">Objetivo final</h2>
                        <p className="mt-2 text-sm font-medium leading-relaxed text-blue-50">{informe.informe.objetivoFinal}</p>
                      </div>
                    </div>
                    <div className="rounded-lg bg-[#00A3E0] p-4 text-sm font-black leading-snug">
                      Profesionales preparados para liderar la transformacion del mercado laboral peruano.
                    </div>
                  </aside>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MercadoLaboralView;
