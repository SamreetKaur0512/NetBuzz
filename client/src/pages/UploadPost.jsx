import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { postAPI } from '../services/api';
import { Icons, toast } from '../components/ui';

export default function UploadPost() {
  const navigate = useNavigate();
  const fileRef  = useRef(null);
  const [file, setFile]         = useState(null);
  const [preview, setPreview]   = useState('');
  const [mediaType, setMediaType] = useState('image');
  const [caption, setCaption]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (f) => {
    if (!f) return;
    const isVideo = f.type.startsWith('video/');
    setMediaType(isVideo ? 'video' : 'image');
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return toast.error('Please select a photo or video.');
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('media', file);
      fd.append('caption', caption);
      await postAPI.create(fd);
      toast.success('Post shared!');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="upload-page">
      <div className="page-header">
        <h1 className="section-title" style={{ fontStyle: 'italic' }}>Share a moment</h1>
      </div>

      {!preview ? (
        <div
          className={`upload-dropzone${dragOver ? ' drag-over' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
        >
          <div className="upload-dropzone-icon">
            <Icons.Image />
          </div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            Drag photo or video here
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            JPEG, PNG, GIF, MP4, MOV — up to 50 MB
          </div>
          <button type="button" className="btn btn-secondary btn-sm">
            Select from device
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            hidden
            onChange={e => handleFile(e.target.files[0])}
          />
        </div>
      ) : (
        <div style={{ position: 'relative', marginBottom: 20 }}>
          {mediaType === 'video' ? (
            <video className="upload-preview" src={preview} controls />
          ) : (
            <img className="upload-preview" src={preview} alt="preview" />
          )}
          <button
            onClick={() => { setFile(null); setPreview(''); }}
            className="btn btn-secondary btn-sm"
            style={{ position: 'absolute', top: 12, right: 12 }}
          >
            <Icons.X /> Change
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Caption</label>
          <textarea
            className="form-input form-textarea"
            placeholder="Write a caption… #hashtags @mentions"
            value={caption}
            onChange={e => setCaption(e.target.value)}
            maxLength={2200}
            style={{ minHeight: 100 }}
          />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', marginTop: 4 }}>
            {caption.length} / 2200
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="btn btn-secondary btn-full"
            onClick={() => navigate('/')}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary btn-full"
            disabled={loading || !file}
          >
            {loading ? 'Sharing…' : 'Share Post'}
          </button>
        </div>
      </form>
    </div>
  );
}
