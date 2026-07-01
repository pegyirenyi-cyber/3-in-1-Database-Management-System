import React, { useRef, useState, useEffect } from 'react';
import { Camera, X, RefreshCw } from 'lucide-react';
import { compressImage } from '../utils';

interface CameraCaptureProps {
  onCapture: (imageData: string) => void;
  onClose: () => void;
}

export default function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setStream(mediaStream);
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("Could not access camera. Please check permissions.");
      onClose();
    }
  };

  const stopCamera = () => {
    stream?.getTracks().forEach(track => track.stop());
  };

  const capturePhoto = async () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
        const dataUrl = canvasRef.current.toDataURL('image/jpeg');
        try {
            const compressed = await compressImage(dataUrl);
            onCapture(compressed);
        } catch (err) {
            onCapture(dataUrl);
        }
        stopCamera();
        onClose();
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-4 max-w-sm w-full space-y-4">
        <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-800">Take Profile Photo</h3>
            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-full"><X size={20} /></button>
        </div>
        <video ref={videoRef} autoPlay playsInline className="w-full rounded-lg bg-black" />
        <canvas ref={canvasRef} className="hidden" />
        <button
          onClick={capturePhoto}
          className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700"
        >
          <Camera size={20} /> Capture Photo
        </button>
      </div>
    </div>
  );
}
