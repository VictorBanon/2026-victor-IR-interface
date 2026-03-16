type DatasetType = '14k' | '60_cla';

interface DataFolder {
  id: DatasetType;
  name: string;
  description: string;
  size: string;
  focus: string;
}

interface DatasetsSectionProps {
  selectedFolder: DatasetType;
  onSelectFolder: (folder: DatasetType) => void;
}

const dataFolders: DataFolder[] = [
  {
    id: '14k',
    name: '14K unique whole genome',
    description: 'Large-scale dataset containing approximately 14,000 prokaryotic genomes from NCBI, providing comprehensive coverage of bacterial and archaeal diversity.',
    size: '~14,000 genomes',
    focus: 'Broad phylogenetic coverage - comprehensive analysis'
  },
  {
    id: '60_cla',
    name: '60 Bacteria Cluster',
    description: 'Dataset of 100 samples genomes from 60 different bacteria.',
    size: '~6,000 genomes',
    focus: 'Same number of genomes per species - balanced representation'
  }
];

function DatasetsSection({ selectedFolder, onSelectFolder }: DatasetsSectionProps) {
  return (
    <section className="datasets-section" id="datasets">
      <h2>Available Datasets</h2>
      <p className="section-intro">
        Choose from our carefully curated datasets, each designed for different analytical purposes:
      </p>
      
      <div className="datasets-grid">
        {dataFolders.map(folder => (
          <div 
            key={folder.id}
            className={`dataset-card ${selectedFolder === folder.id ? 'active' : ''}`}
            onClick={() => onSelectFolder(folder.id)}
          >
            <div className="dataset-header">
              <h3>{folder.name}</h3>
              <span className="dataset-size">{folder.size}</span>
            </div>
            <p className="dataset-description">{folder.description}</p>
            <div className="dataset-focus">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v6l4 2"/>
              </svg>
              <span>{folder.focus}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default DatasetsSection;
