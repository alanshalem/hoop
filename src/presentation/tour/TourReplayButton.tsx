'use client';

import React, { useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { TourPicker } from './TourPicker';

/** "Ver tutorial" header action of the help screen: opens the replay picker. */
export const TourReplayButton: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <TouchButton
        variant="secondary"
        leftIcon={<GraduationCap size={ICON_SIZE.md} />}
        onClick={() => setIsOpen(true)}
        data-tour="help-tour-button"
      >
        Ver tutorial
      </TouchButton>
      <TourPicker isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
};
