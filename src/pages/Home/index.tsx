import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import Sidebar from './Sidebar';
import AbstractSection from './AbstractSection';
import DatasetsSection from './DatasetsSection';
import TaxonomyTable from './TaxonomyTable';
import type { TaxonomyRow, DatasetType } from './types';
import './Home.css';

function Home() {
  // State
  const navigate = useNavigate();
  const [rawData, setRawData] = useState<string[][]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState<DatasetType>('14k');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [entriesPerPage, setEntriesPerPage] = useState(10);
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Toggle theme
  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  // Load data when dataset changes
  useEffect(() => {
    loadData(selectedFolder);
  }, [selectedFolder]);

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // Load CSV data
  const loadData = async (folder: DatasetType) => {
    setLoading(true);
    try {
      const path = `${import.meta.env.BASE_URL}data/${folder}/taxonomy.csv`;
      const response = await fetch(path);
      
      if (!response.ok) {
        throw new Error(`Failed to load data: ${response.statusText}`);
      }
      
      const text = await response.text();
      const rows = text.trim().split('\n').map(line => line.split(','));
      setRawData(rows);
    } catch (err) {
      console.error('Error loading CSV:', err);
      setRawData([]);
    } finally {
      setLoading(false);
    }
  };

  // Parse CSV data
  const taxonomyData = useMemo(() => {
    if (!rawData || rawData.length === 0) return [];
    
    const headers = rawData[0];
    const data: TaxonomyRow[] = [];
    
    for (let i = 1; i < rawData.length; i++) {
      if (rawData[i] && rawData[i].length > 0) {
        const row: any = {};
        headers.forEach((header: string, idx: number) => {
          row[header.trim()] = rawData[i][idx]?.trim() || '';
        });
        data.push(row);
      }
    }
    
    return data;
  }, [rawData]);

  // Group data by organism ID
  const groupedData = useMemo(() => {
    return taxonomyData.reduce((acc, row) => {
      if (!acc[row.ID]) {
        acc[row.ID] = [];
      }
      acc[row.ID].push(row);
      return acc;
    }, {} as Record<string, TaxonomyRow[]>);
  }, [taxonomyData]);

  // Get unique organisms (one entry per ID)
  const uniqueOrganisms = useMemo(() => {
    return Object.values(groupedData).map(group => group[0]);
  }, [groupedData]);

  // Filter organisms based on search
  const filteredOrganisms = useMemo(() => {
    if (!searchTerm) return uniqueOrganisms;
    
    const searchLower = searchTerm.toLowerCase();
    return uniqueOrganisms.filter(row => {
      return (
        row.Species?.toLowerCase().includes(searchLower) ||
        row.Genus?.toLowerCase().includes(searchLower) ||
        row.Family?.toLowerCase().includes(searchLower) ||
        row.full_name?.toLowerCase().includes(searchLower) ||
        row.ID?.toLowerCase().includes(searchLower)
      );
    });
  }, [uniqueOrganisms, searchTerm]);

  // Navigate to Dashboard with all replicons for a given organism ID
  const handleRowClick = (id: string) => {
    const replicons = groupedData[id]?.map(r => r['ID-replicon']).filter(Boolean) ?? [];
    const params = new URLSearchParams({
      dataset: selectedFolder,
      replicons: replicons.join(','),
    });
    navigate(`/dashboard?${params.toString()}`);
  };

  return (
    <div className={`blog-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`}>
      <Header isDarkMode={isDarkMode} onToggleTheme={toggleTheme} />
      
      <div className="discover-data-page">
        <Sidebar />

        <div className="discover-data-container">
          <header className="discover-data-header">
            <div>
              <h1>Inverted Repeats in Bacterial Genomes</h1>
              <p className="subtitle">Structure, Distribution, and Interactive Data Exploration</p>
            </div>
          </header>

          <AbstractSection />

          <DatasetsSection
            selectedFolder={selectedFolder}
            onSelectFolder={setSelectedFolder}
          />

          {/* Taxonomy Browser Section */}
          <section className="taxonomy-section" id="taxonomy">
            <div className="section-header">
              <div>
                <h2>Taxonomy Browser</h2>
                <p className="section-subtitle">
                  Explore prokaryotic genome taxonomy and replicon information
                </p>
              </div>
            </div>

            {loading ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>Loading taxonomy data...</p>
              </div>
            ) : (
              <TaxonomyTable
                data={filteredOrganisms}
                allData={uniqueOrganisms}
                groupedData={groupedData}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                entriesPerPage={entriesPerPage}
                onEntriesChange={setEntriesPerPage}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                totalEntries={uniqueOrganisms.length}
                onRowClick={handleRowClick}
              />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default Home;
