'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

interface Props {
  onCapture: (file: File) => void;
  onClose: () => void;
}

export default function CameraCapture({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => setReady(true);
        }
      })
      .catch(() => setError('Impossible d\'acceder a la camera. Verifie les permissions.'));

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const takePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `checkpoint-${Date.now()}.jpg`, { type: 'image/jpeg' });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        onCapture(file);
      },
      'image/jpeg',
      0.8,
    );
  }, [onCapture]);

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      {error ? (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center">
            <p className="text-red-400 text-sm mb-4">{error}</p>
            <button onClick={onClose} className="text-white text-sm underline">Fermer</button>
          </div>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="flex-1 object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute bottom-8 inset-x-0 flex items-center justify-center gap-6">
            <button
              onClick={onClose}
              className="w-12 h-12 bg-white/20 backdrop-blur rounded-full flex items-center justify-center text-white"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <button
              onClick={takePhoto}
              disabled={!ready}
              className="w-20 h-20 bg-white rounded-full border-4 border-white/50 disabled:opacity-30 active:scale-90 transition-transform"
            />
          </div>
        </>
      )}
    </div>
  );
}
