export const company = {
  brandName: "RH Cursos & Soluções",
  legalName: "RH Cursos e Soluções LTDA",
  cnpj: "08.703.044/0001-90",
  foundedYear: 2007,
  address: {
    street: "QS 03 Lote 3, Ed. Pátio Capital, Sala 1105",
    district: "Águas Claras",
    cityState: "Águas Claras - DF",
    postalCode: "71953-000",
    full: "QS 03 Lote 3, Ed. Pátio Capital, Sala 1105, Águas Claras - DF, 71953-000"
  },
  phones: {
    primary: "(61) 3965-1929",
    secondary: "(61) 3965-1939",
    whatsapp: "(61) 99112-9682"
  },
  links: {
    whatsapp: "https://wa.me/5561991129682",
    email: "mailto:info@rhcursos.com.br",
    maps: "https://www.google.com/maps/search/RH+Cursos+%C3%81guas+Claras+Bras%C3%ADlia",
    linkedin: "https://www.linkedin.com/company/rhcursoesolucoes",
    facebook: "https://www.facebook.com/rhcursostreinamento/",
    instagram: "https://www.instagram.com/rhcursos/",
    youtube: "https://www.youtube.com/@rhcursosetreinamentosempre580"
  },
  email: "info@rhcursos.com.br",
  reportedMetrics: {
    completedClasses: "+320",
    averageRecommendation: "96%"
  },
  logo: {
    src: "/images/brand/rh-cursos-logo-azul.png",
    alt: "RH Cursos e Soluções Empresarial"
  }
} as const;

export function getCompanyYears(currentYear = new Date().getFullYear()) {
  return Math.max(0, currentYear - company.foundedYear);
}
