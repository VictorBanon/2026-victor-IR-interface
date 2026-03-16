export interface TaxonomyRow {
  Superdomain: string;
  Domain: string;
  Phylum: string;
  Class: string;
  Order: string;
  Family: string;
  Genus: string;
  Species: string;
  ID: string;
  full_name: string;
  Replicons_name: string;
  Replicons_type: string;
  'ID-replicon': string;
}

export type DatasetType = '14k' | '60_cla';
