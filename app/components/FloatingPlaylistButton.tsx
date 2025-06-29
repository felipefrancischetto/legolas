"use client";

import { useState } from 'react';
import PlaylistTextModal from './PlaylistTextModal';

export default function FloatingPlaylistButton() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <PlaylistTextModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
} 