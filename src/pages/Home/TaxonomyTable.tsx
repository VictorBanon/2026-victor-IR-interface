import { useState, useMemo, useEffect, useRef } from 'react';
import type { TaxonomyRow } from './types';

interface TaxonomyTableProps {
  data: TaxonomyRow[];
  /** Full unfiltered dataset — used to populate dropdown options */
  allData: TaxonomyRow[];
  groupedData: Record<string, TaxonomyRow[]>;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  entriesPerPage: number;
  onEntriesChange: (entries: number) => void;
  currentPage: number;
  onPageChange: (page: number) => void;
  totalEntries: number;
  /** Called when a row is clicked; receives the organism ID */
  onRowClick?: (id: string) => void;
}

type SortField = 'Domain' | 'Phylum' | 'Class' | 'Order' | 'Family' | 'Genus' | 'Species' | 'full_name' | 'ID' | 'Replicons';
type SortDirection = 'asc' | 'desc' | null;

// ── ColumnHeader: defined OUTSIDE TaxonomyTable so React never remounts it ──
interface ColumnHeaderProps {
  field: SortField;
  label: string;
  filterable?: boolean;
  sortField: SortField | null;
  sortDirection: SortDirection;
  columnFilters: Record<string, Set<string>>;
  activeColumn: string | null;
  uniqueValues: string[];
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  onSort: (field: SortField) => void;
  onToggleActive: (field: string) => void;
  onFilterToggle: (column: string, value: string) => void;
  onClearFilter: (column: string) => void;
}

function ColumnHeader({
  field, label, filterable = true,
  sortField, sortDirection, columnFilters, activeColumn, uniqueValues,
  dropdownRef, onSort, onToggleActive, onFilterToggle, onClearFilter,
}: ColumnHeaderProps) {
  const fieldStr  = field as string;
  const isActive  = activeColumn === fieldStr;
  const isSorted  = sortField === field;
  const hasFilter = (columnFilters[fieldStr]?.size ?? 0) > 0;

  return (
    <th className={`dt-header ${isSorted ? 'sorting-' + sortDirection : ''}`}>
      <div className="dt-header-content">
        <button className="dt-sort-btn" onClick={() => onSort(field)}>
          <span className="dt-header-label">{label}</span>
          <span className="dt-sort-icons">
            <span className={`sort-asc  ${isSorted && sortDirection === 'asc'  ? 'active' : ''}`}>▲</span>
            <span className={`sort-desc ${isSorted && sortDirection === 'desc' ? 'active' : ''}`}>▼</span>
          </span>
        </button>

        {filterable && uniqueValues.length > 0 && (
          <button
            className={`dt-filter-btn ${hasFilter ? 'has-filter' : ''}`}
            onClick={(e) => { e.stopPropagation(); onToggleActive(fieldStr); }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            {hasFilter && <span className="filter-count">{columnFilters[fieldStr].size}</span>}
          </button>
        )}
      </div>

      {/* Filter Dropdown */}
      {isActive && (
        <div className="dt-filter-dropdown" ref={dropdownRef}>
          <div className="dt-filter-header">
            <span>Filter by {label}</span>
            {hasFilter && (
              <button className="dt-clear-btn" onClick={() => onClearFilter(fieldStr)}>
                Clear
              </button>
            )}
          </div>
          <div className="dt-filter-list">
            {uniqueValues.map(value => (
              <label key={value} className="dt-filter-item">
                <input
                  type="checkbox"
                  checked={columnFilters[fieldStr]?.has(value) || false}
                  onChange={() => onFilterToggle(fieldStr, value)}
                />
                <span>{value}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </th>
  );
}

function TaxonomyTable({
  data,
  allData,
  groupedData,
  searchTerm,
  onSearchChange,
  entriesPerPage,
  onEntriesChange,
  currentPage,
  onPageChange,
  totalEntries,
  onRowClick,
}: TaxonomyTableProps) {
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});
  const [activeColumn, setActiveColumn] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveColumn(null);
      }
    };

    if (activeColumn) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeColumn]);

  // Pre-compute unique values for every filterable column from the FULL dataset.
  // Using allData (not filtered data) ensures all options always stay visible.
  const uniqueValuesByField = useMemo(() => {
    const fields: SortField[] = ['Domain', 'Phylum', 'Class', 'Order', 'Family', 'Genus', 'Species', 'full_name', 'ID'];
    const result: Record<string, string[]> = {};
    for (const field of fields) {
      const set = new Set<string>();
      for (const row of allData) {
        const v = row[field as keyof TaxonomyRow];
        if (v && typeof v === 'string' && v.trim()) set.add(v);
      }
      result[field] = Array.from(set).sort();
    }
    return result;
  }, [allData]);

  // Handle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortField(null);
        setSortDirection(null);
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Handle filter selection
  const handleFilterToggle = (column: string, value: string) => {
    setColumnFilters(prev => {
      const newFilters = { ...prev };
      if (!newFilters[column]) {
        newFilters[column] = new Set();
      }
      
      if (newFilters[column].has(value)) {
        newFilters[column].delete(value);
        if (newFilters[column].size === 0) {
          delete newFilters[column];
        }
      } else {
        newFilters[column].add(value);
      }
      
      return newFilters;
    });
    onPageChange(1);
  };

  // Clear all filters for a column
  const clearColumnFilter = (column: string) => {
    setColumnFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[column];
      return newFilters;
    });
  };

  // Apply filters and sorting
  const processedData = useMemo(() => {
    let result = [...data];

    // Apply column filters
    Object.entries(columnFilters).forEach(([column, values]) => {
      if (values.size > 0) {
        result = result.filter(row => {
          const value = row[column as keyof TaxonomyRow];
          return value && values.has(value);
        });
      }
    });

    // Apply sorting
    if (sortField && sortDirection) {
      result.sort((a, b) => {
        let aValue: string | number;
        let bValue: string | number;

        if (sortField === 'Replicons') {
          aValue = groupedData[a.ID]?.length || 0;
          bValue = groupedData[b.ID]?.length || 0;
        } else {
          aValue = a[sortField] || '';
          bValue = b[sortField] || '';
        }

        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortDirection === 'asc' 
            ? aValue.localeCompare(bValue)
            : bValue.localeCompare(aValue);
        }

        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortDirection === 'asc' 
            ? aValue - bValue
            : bValue - aValue;
        }

        return 0;
      });
    }

    return result;
  }, [data, sortField, sortDirection, columnFilters, groupedData]);

  // Calculate pagination
  const totalPages = Math.ceil(processedData.length / entriesPerPage);
  const startIndex = (currentPage - 1) * entriesPerPage;
  const endIndex = Math.min(startIndex + entriesPerPage, processedData.length);
  const paginatedData = processedData.slice(startIndex, endIndex);

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 7;
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      
      if (currentPage > 3) {
        pages.push('...');
      }
      
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      
      if (currentPage < totalPages - 2) {
        pages.push('...');
      }
      
      pages.push(totalPages);
    }
    
    return pages;
  };

  // Shared props passed to every ColumnHeader instance
  const colHeaderProps = {
    sortField, sortDirection, columnFilters, activeColumn, dropdownRef,
    onSort:          handleSort,
    onToggleActive:  (f: string) => setActiveColumn(prev => prev === f ? null : f),
    onFilterToggle:  handleFilterToggle,
    onClearFilter:   clearColumnFilter,
  };

  return (
    <div className="datatable-container">
      {/* DataTables Top Controls */}
      <div className="dt-controls-top">
        <div className="dt-length">
          <label>
            Show
            <select 
              value={entriesPerPage} 
              onChange={(e) => {
                onEntriesChange(Number(e.target.value));
                onPageChange(1);
              }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            entries
          </label>
        </div>
        <div className="dt-search">
          <label>
            Search:
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => {
                onSearchChange(e.target.value);
                onPageChange(1);
              }}
              placeholder=""
            />
          </label>
        </div>
      </div>

      {/* Active Filters Bar */}
      {Object.keys(columnFilters).length > 0 && (
        <div className="dt-active-filters">
          <span className="filters-label">Active Filters:</span>
          {Object.entries(columnFilters).map(([column, values]) => (
            <div key={column} className="filter-tag">
              <strong>{column}:</strong> {Array.from(values).slice(0, 3).join(', ')}
              {values.size > 3 && ` +${values.size - 3} more`}
              <button
                className="remove-filter"
                onClick={() => clearColumnFilter(column)}
              >
                ×
              </button>
            </div>
          ))}
          <button
            className="clear-all-filters"
            onClick={() => setColumnFilters({})}
          >
            Clear All
          </button>
        </div>
      )}

      {/* Table */}
      <div className="dt-table-wrapper">
        <table className="datatable">
          <thead>
            <tr>
              <ColumnHeader {...colHeaderProps} field="Domain"    label="Domain"    uniqueValues={uniqueValuesByField['Domain']    ?? []} />
              <ColumnHeader {...colHeaderProps} field="Phylum"    label="Phylum"    uniqueValues={uniqueValuesByField['Phylum']    ?? []} />
              <ColumnHeader {...colHeaderProps} field="Class"     label="Class"     uniqueValues={uniqueValuesByField['Class']     ?? []} />
              <ColumnHeader {...colHeaderProps} field="Order"     label="Order"     uniqueValues={uniqueValuesByField['Order']     ?? []} />
              <ColumnHeader {...colHeaderProps} field="Family"    label="Family"    uniqueValues={uniqueValuesByField['Family']    ?? []} />
              <ColumnHeader {...colHeaderProps} field="Genus"     label="Genus"     uniqueValues={uniqueValuesByField['Genus']     ?? []} />
              <ColumnHeader {...colHeaderProps} field="Species"   label="Species"   uniqueValues={uniqueValuesByField['Species']   ?? []} />
              <ColumnHeader {...colHeaderProps} field="full_name" label="Organism"  uniqueValues={uniqueValuesByField['full_name'] ?? []} />
              <ColumnHeader {...colHeaderProps} field="ID"        label="ID"        uniqueValues={uniqueValuesByField['ID']        ?? []} />
              <ColumnHeader {...colHeaderProps} field="Replicons" label="Replicons" uniqueValues={[]} filterable={false} />
            </tr>
          </thead>
          <tbody>
            {processedData.length === 0 ? (
              <tr>
                <td colSpan={10} className="dt-empty">
                  {Object.keys(columnFilters).length > 0 
                    ? 'No matching records found' 
                    : searchTerm 
                      ? 'No matching records found' 
                      : 'No data available in table'}
                </td>
              </tr>
            ) : (
              paginatedData.map((row, idx) => {
                const repliconCount = groupedData[row.ID]?.length || 0;
                const chromosomes = groupedData[row.ID]?.filter(r => r.Replicons_type?.includes('chromosome')).length || 0;
                const plasmids = groupedData[row.ID]?.filter(r => r.Replicons_type?.includes('plasmid')).length || 0;
                
                return (
                  <tr 
                    key={`${row.ID}-${idx}`}
                    className={`${idx % 2 === 0 ? 'even' : 'odd'}${onRowClick ? ' dt-row-clickable' : ''}`}
                    onClick={() => onRowClick?.(row.ID)}
                    title={onRowClick ? `Open ${row.full_name || row.ID} in Dashboard` : undefined}
                  >
                    <td>{row.Domain}</td>
                    <td>{row.Phylum}</td>
                    <td>{row.Class}</td>
                    <td>{row.Order}</td>
                    <td>{row.Family}</td>
                    <td>{row.Genus}</td>
                    <td>{row.Species}</td>
                    <td className="dt-organism">{row.full_name}</td>
                    <td className="dt-id">{row.ID}</td>
                    <td className="dt-replicons">
                      <span className="replicon-badge total">{repliconCount}</span>
                      {chromosomes > 0 && (
                        <span className="replicon-badge chr">{chromosomes}c</span>
                      )}
                      {plasmids > 0 && (
                        <span className="replicon-badge pla">{plasmids}p</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* DataTables Bottom Controls */}
      <div className="dt-controls-bottom">
        <div className="dt-info">
          Showing {processedData.length > 0 ? startIndex + 1 : 0} to {endIndex} of {processedData.length} entries
          {(searchTerm || Object.keys(columnFilters).length > 0) && 
            ` (filtered from ${totalEntries} total entries)`
          }
        </div>
        
        {totalPages > 1 && (
          <div className="dt-pagination">
            <button
              className="dt-page-btn"
              onClick={() => onPageChange(1)}
              disabled={currentPage === 1}
            >
              First
            </button>
            <button
              className="dt-page-btn"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              Previous
            </button>
            
            {getPageNumbers().map((page, idx) => (
              typeof page === 'number' ? (
                <button
                  key={idx}
                  className={`dt-page-btn dt-page-num ${currentPage === page ? 'active' : ''}`}
                  onClick={() => onPageChange(page)}
                >
                  {page}
                </button>
              ) : (
                <span key={idx} className="dt-page-ellipsis">{page}</span>
              )
            ))}
            
            <button
              className="dt-page-btn"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              Next
            </button>
            <button
              className="dt-page-btn"
              onClick={() => onPageChange(totalPages)}
              disabled={currentPage === totalPages}
            >
              Last
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default TaxonomyTable;
