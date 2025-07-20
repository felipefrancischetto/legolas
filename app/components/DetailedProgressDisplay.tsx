'use client';

import { useState, useEffect } from 'react';

interface ProgressStep {
  type: string;
  step: string;
  substep?: string;
  detail?: string;
  progress?: number;
  timestamp: string;
  completed?: boolean;
}

interface DetailedProgressDisplayProps {
  currentStep: string;
  currentSubstep?: string;
  progress: number;
  detail?: string;
  isConnected: boolean;
  type: 'individual' | 'playlist';
  steps?: ProgressStep[];
}

export default function DetailedProgressDisplay({
  currentStep,
  currentSubstep,
  progress,
  detail,
  isConnected,
  type,
  steps: externalSteps
}: DetailedProgressDisplayProps) {
  const [steps, setSteps] = useState<ProgressStep[]>([]);

  // Adicionar novo passo quando mudar
  useEffect(() => {
    if (externalSteps) return; // Não atualizar estado interno se steps externos forem fornecidos
    if (currentStep && currentStep !== 'Conectando...') {
      setSteps(prev => {
        const lastStep = prev[prev.length - 1];
        
        // Não adicionar se for o mesmo passo
        if (lastStep && lastStep.step === currentStep && lastStep.substep === currentSubstep) {
          return prev;
        }

        // Marcar passo anterior como completo
        const updatedPrev = prev.map((step, index) => 
          index === prev.length - 1 
            ? { ...step, completed: true }
            : step
        );

        // Adicionar novo passo
        const newStep: ProgressStep = {
          type: getStepType(currentStep),
          step: currentStep,
          substep: currentSubstep,
          detail,
          progress,
          timestamp: new Date().toISOString(),
          completed: false
        };

        return [...updatedPrev, newStep];
      });
    }
  }, [currentStep, currentSubstep, externalSteps]); // Removido 'detail' e 'progress' que podem mudar constantemente

  const getStepType = (step: string): string => {
    if (step.includes('Conectado') || step.includes('Preparando')) return 'init';
    if (step.includes('pasta') || step.includes('Verificando')) return 'setup';
    if (step.includes('informações') || step.includes('Extraindo')) return 'info';
    if (step.includes('Baixando') || step.includes('download')) return 'download';
    if (step.includes('metadados') || step.includes('Beatport')) return 'metadata';
    if (step.includes('Escrevendo') || step.includes('tags')) return 'tagging';
    if (step.includes('Verificação') || step.includes('integridade')) return 'verification';
    if (step.includes('concluído') || step.includes('finalizado')) return 'complete';
    return 'unknown';
  };

  const getStepIcon = (stepType: string, completed: boolean) => {
    const baseClass = `w-4 h-4 ${completed ? 'text-green-400' : 'text-blue-400'}`;
    
    switch (stepType) {
      case 'init':
        return <div className={`${baseClass} bg-blue-500 rounded-full ${!completed ? 'animate-pulse' : ''}`} />;
      case 'setup':
        return (
          <svg className={baseClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        );
      case 'info':
        return (
          <svg className={baseClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'download':
        return (
          <svg className={baseClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        );
      case 'metadata':
        return (
          <svg className={baseClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
        );
      case 'tagging':
        return (
          <svg className={baseClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        );
      case 'verification':
        return (
          <svg className={baseClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'complete':
        return (
          <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      default:
        return <div className={`w-4 h-4 bg-zinc-500 rounded-full ${!completed ? 'animate-pulse' : ''}`} />;
    }
  };

  // Limpar passos quando não há download ativo
  useEffect(() => {
    if (externalSteps) return;
    if (!currentStep || currentStep === 'Conectando...') {
      setSteps([]);
    }
  }, [currentStep, externalSteps]);

  const stepsToShow = externalSteps || steps;
  if (!stepsToShow || stepsToShow.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 sm:space-y-2">
      {/* Header com informações principais */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-1">
          {isConnected && (
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse sm:w-1.5 sm:h-1.5" title="Conectado ao servidor" />
          )}
          <span className="text-white font-medium text-sm sm:text-xs">
            {currentStep || 'Preparando...'}
          </span>
        </div>
        {progress > 0 && (
          <span className="text-zinc-400 text-xs font-mono sm:text-[10px]">
            {progress}%
          </span>
        )}
      </div>

      {/* Substep */}
      {currentSubstep && (
        <div className="flex items-center gap-2 pl-4 sm:gap-1 sm:pl-2">
          <div className="w-1 h-1 bg-zinc-500 rounded-full" />
          <span className="text-zinc-400 text-xs sm:text-[10px]">
            {currentSubstep}
          </span>
        </div>
      )}

      {/* Detail */}
      {detail && (
        <div className="text-zinc-500 text-xs pl-4 truncate sm:pl-2 sm:text-[10px]">
          {detail}
        </div>
      )}

      {/* Lista de passos */}
      {steps && steps.length > 0 && (
        <div className="space-y-2 sm:space-y-1">
          <div className="text-zinc-400 text-xs font-medium sm:text-[10px]">Progresso:</div>
          <div className="space-y-1">
            {steps.map((step, index) => {
              const isActive = step.step === currentStep;
              const isCompleted = step.completed;
              
              return (
                <div
                  key={index}
                  className={`flex items-center gap-2 p-2 rounded transition-all duration-200 sm:gap-1 sm:p-1 ${
                    isActive ? 'bg-blue-900/30 border border-blue-700' :
                    isCompleted ? 'bg-green-900/20 border border-green-800' :
                    'bg-zinc-800/50'
                  }`}
                >
                  <div className="flex-shrink-0">
                    {getStepIcon(step.type, isCompleted || false)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-medium truncate sm:text-xs ${
                        isActive ? 'text-blue-400' :
                        isCompleted ? 'text-green-400' :
                        'text-zinc-400'
                      }`}>
                        {step.step}
                      </span>
                      {isActive && (
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse flex-shrink-0 sm:w-1.5 sm:h-1.5" />
                      )}
                      {isCompleted && (
                        <svg className="w-4 h-4 text-green-400 flex-shrink-0 sm:w-3 sm:h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    {step.substep && (
                      <div className="text-xs text-zinc-500 truncate mt-1 sm:text-[10px]">
                        {step.substep}
                      </div>
                    )}
                    {step.detail && (
                      <div className="text-xs text-zinc-500 truncate mt-1 sm:text-[10px]">
                        {step.detail}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Barra de progresso geral */}
      {progress > 0 && (
        <div className="space-y-1">
          <div className="w-full bg-zinc-700 rounded-full h-2 sm:h-1.5">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300 animate-progress-pulse"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
} 