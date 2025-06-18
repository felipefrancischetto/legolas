import { useState, useCallback, useMemo } from 'react';
import { FileInfo } from '../types';

interface UseFileListProps {
  files: FileInfo[];
  onSort?: (files: FileInfo[]) => void;
}

export function useFileList({ files, onSort }: UseFileListProps) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<string>('title');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [groupByField, setGroupByField] = useState<string>('');

  const filteredFiles = useMemo(() => {
    return files.filter(file => {
      const searchLower = search.toLowerCase();
      return (
        file.title?.toLowerCase().includes(searchLower) ||
        file.artist?.toLowerCase().includes(searchLower) ||
        file.album?.toLowerCase().includes(searchLower) ||
        file.genre?.toLowerCase().includes(searchLower) ||
        file.label?.toLowerCase().includes(searchLower)
      );
    });
  }, [files, search]);

  const sortedFiles = useMemo(() => {
    const sorted = [...filteredFiles].sort((a, b) => {
      let valA: any, valB: any;

      switch (sortBy) {
        case 'title':
          valA = a.title || a.displayName;
          valB = b.title || b.displayName;
          break;
        case 'artist':
          valA = a.artist;
          valB = b.artist;
          break;
        case 'album':
          valA = a.album;
          valB = b.album;
          break;
        case 'genre':
          valA = a.genre;
          valB = b.genre;
          break;
        case 'bpm':
          valA = a.bpm;
          valB = b.bpm;
          break;
        case 'key':
          valA = a.key;
          valB = b.key;
          break;
        case 'ano':
          valA = a.ano;
          valB = b.ano;
          break;
        default:
          valA = (a as any)[sortBy];
          valB = (b as any)[sortBy];
      }

      if (valA === undefined) return 1;
      if (valB === undefined) return -1;
      if (valA === valB) return 0;

      const result = valA < valB ? -1 : 1;
      return sortOrder === 'asc' ? result : -result;
    });

    if (onSort) {
      onSort(sorted);
    }

    return sorted;
  }, [filteredFiles, sortBy, sortOrder, onSort]);

  const groupedFiles = useMemo(() => {
    if (!groupByField) return { '': sortedFiles };

    return sortedFiles.reduce((groups, file) => {
      const groupValue = (file as any)[groupByField] || 'Sem valor';
      if (!groups[groupValue]) {
        groups[groupValue] = [];
      }
      groups[groupValue].push(file);
      return groups;
    }, {} as Record<string, FileInfo[]>);
  }, [sortedFiles, groupByField]);

  const toggleSort = useCallback((field: string) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  }, [sortBy]);

  return {
    search,
    setSearch,
    sortBy,
    sortOrder,
    groupByField,
    setGroupByField,
    toggleSort,
    sortedFiles,
    groupedFiles,
    filteredFiles
  };
} 