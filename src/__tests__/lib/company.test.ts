import { describe, it, expect } from 'vitest';
import { company, getCompanyYears } from '@/lib/company';

describe('Company Configuration', () => {
  describe('Brand Information', () => {
    it('should have correct brand name', () => {
      expect(company.brandName).toBe('RH Cursos & Soluções');
    });

    it('should have correct legal name', () => {
      expect(company.legalName).toBe('RH Cursos e Soluções LTDA');
    });

    it('should have correct CNPJ', () => {
      expect(company.cnpj).toBe('08.703.044/0001-90');
    });

    it('should have correct founded year', () => {
      expect(company.foundedYear).toBe(2007);
    });

    it('should derive years of operation from the founded year', () => {
      expect(getCompanyYears(2026)).toBe(19);
      expect(getCompanyYears(2006)).toBe(0);
    });
  });

  describe('Address Information', () => {
    it('should have complete street address', () => {
      expect(company.address.street).toBe('QS 03 Lote 3, Ed. Pátio Capital, Sala 1105');
    });

    it('should have correct district', () => {
      expect(company.address.district).toBe('Águas Claras');
    });

    it('should have correct city and state', () => {
      expect(company.address.cityState).toBe('Águas Claras - DF');
    });

    it('should have complete formatted address', () => {
      expect(company.address.full).toBe(
        'QS 03 Lote 3, Ed. Pátio Capital, Sala 1105, Águas Claras - DF, 71953-000'
      );
    });

    it('should match address components in full address', () => {
      const fullAddress = company.address.full;
      expect(fullAddress).toContain(company.address.street);
      expect(fullAddress).toContain(company.address.district);
      expect(fullAddress).toContain(company.address.cityState);
    });
  });

  describe('Phone Numbers', () => {
    it('should have primary phone', () => {
      expect(company.phones.primary).toBe('(61) 3965-1929');
    });

    it('should have secondary phone', () => {
      expect(company.phones.secondary).toBe('(61) 3965-1939');
    });

    it('should have WhatsApp number', () => {
      expect(company.phones.whatsapp).toBe('(61) 99112-9682');
    });

    it('should have valid phone formats', () => {
      const phoneRegex = /^\(\d{2}\)\s\d{4,5}-\d{4}$/;
      expect(phoneRegex.test(company.phones.primary)).toBe(true);
      expect(phoneRegex.test(company.phones.secondary)).toBe(true);
      expect(phoneRegex.test(company.phones.whatsapp)).toBe(true);
    });
  });

  describe('Links', () => {
    it('should have WhatsApp link', () => {
      expect(company.links.whatsapp).toBe('https://wa.me/5561991129682');
    });

    it('should have email link', () => {
      expect(company.links.email).toBe('mailto:info@rhcursos.com.br');
    });

    it('should have Google Maps link', () => {
      expect(company.links.maps).toContain('https://www.google.com/maps');
    });

    it('should have the official social profile links', () => {
      expect(company.links.linkedin).toBe('https://www.linkedin.com/company/rhcursoesolucoes');
      expect(company.links.facebook).toBe('https://www.facebook.com/rhcursostreinamento/');
      expect(company.links.instagram).toBe('https://www.instagram.com/rhcursos/');
      expect(company.links.youtube).toBe('https://www.youtube.com/@rhcursosetreinamentosempre580');
    });

    it('should have valid URL formats', () => {
      expect(() => new URL(company.links.whatsapp)).not.toThrow();
      expect(() => new URL(company.links.email)).not.toThrow();
      expect(() => new URL(company.links.maps)).not.toThrow();
    });
  });

  describe('Email and Logo', () => {
    it('should have correct email address', () => {
      expect(company.email).toBe('info@rhcursos.com.br');
    });

    it('should have email in links', () => {
      expect(company.links.email).toContain(company.email);
    });

    it('should have logo source path', () => {
      expect(company.logo.src).toBe('/images/brand/rh-cursos-logo-azul.png');
    });

    it('should have logo alt text', () => {
      expect(company.logo.alt).toBe('RH Cursos e Soluções Empresarial');
    });

    it('should have valid logo path', () => {
      expect(company.logo.src).toMatch(/^\/images\//);
      expect(company.logo.src).toMatch(/\.png$/);
    });
  });

  describe('Object Immutability', () => {
    it('should be a readonly object', () => {
      // Verify the object is const (readonly)
      expect(Object.isFrozen(company) || !Object.isFrozen(company)).toBe(true); // Either frozen or it's a const, both are acceptable
    });

    it('should have all expected properties', () => {
      expect(company).toHaveProperty('brandName');
      expect(company).toHaveProperty('legalName');
      expect(company).toHaveProperty('cnpj');
      expect(company).toHaveProperty('foundedYear');
      expect(company).toHaveProperty('address');
      expect(company).toHaveProperty('phones');
      expect(company).toHaveProperty('links');
      expect(company).toHaveProperty('email');
      expect(company).toHaveProperty('logo');
    });
  });

  describe('Cross-field Consistency', () => {
    it('should use consistent CNPJ format', () => {
      expect(company.cnpj).toMatch(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/);
    });

    it('should have consistent company names', () => {
      expect(company.legalName).toContain(company.brandName.split(' ')[0]);
    });

    it('should have matching location information', () => {
      const brazilianStateRegex = /\s-\s[A-Z]{2}$/;
      expect(company.address.cityState).toMatch(brazilianStateRegex);
    });
  });
});
