'use client';
import { useEffect, useState } from 'react';
import Card from '../components/common/Card.jsx';
import Button from '../components/common/Button.jsx';
import Badge from '../components/common/Badge.jsx';
import Modal from '../components/common/Modal.jsx';
import Input from '../components/common/Input.jsx';
import Loader from '../components/common/Loader.jsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus,
  faCopy,
  faPenToSquare,
  faTrashCan,
  faFileLines,
} from '@fortawesome/free-solid-svg-icons';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: '', category: '', content: '', variables: '' });

  useEffect(() => {
    fetchTemplates({ reset: true, nextOffset: 0 });
  }, []);

  const fetchTemplates = async ({ reset = false, nextOffset = 0 } = {}) => {
    if (!reset) {
      setLoadingMore(true);
    }
    try {
      const params = new URLSearchParams();
      params.set('limit', '24');
      params.set('offset', String(nextOffset));
      const response = await fetch(`/api/templates?${params.toString()}`, { credentials: 'include' });
      const data = await response.json();
      const list = data.data || [];
      const meta = data.meta || {};
      setHasMore(Boolean(meta.hasMore));
      setOffset(meta.nextOffset ?? nextOffset + list.length);
      if (reset) {
        setTemplates(list);
      } else {
        setTemplates((prev) => [...prev, ...list]);
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
      if (reset) {
        setTemplates([]);
        setHasMore(false);
        setOffset(0);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleCreateTemplate = async (e) => {
    e.preventDefault();
    try {
      const variablesArray = newTemplate.variables.split(',').map(v => v.trim()).filter(v => v);
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: newTemplate.name,
          category: newTemplate.category,
          content: newTemplate.content,
          variables: variablesArray,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create template');
      }
      setShowCreateModal(false);
      setNewTemplate({ name: '', category: '', content: '', variables: '' });
      fetchTemplates();
    } catch (error) {
      console.error('Error creating template:', error);
    }
  };

  const categories = ['greeting', 'sales', 'general', 'reminder', 'follow-up', 'support'];

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader size="lg" text="Loading templates..." />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="templates-page">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-aa-dark-blue mb-2">Templates</h1>
          <p className="text-aa-gray">Create and manage message templates</p>
        </div>
        <Button
          variant="primary"
          icon={<FontAwesomeIcon icon={faPlus} style={{ fontSize: 18 }} />}
          onClick={() => setShowCreateModal(true)}
          className="w-full sm:w-auto"
        >
          Create Template
        </Button>
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates.map(template => (
          <Card key={template.id} className="flex flex-col" data-testid={`template-${template.id}`}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <h3 className="font-bold text-aa-dark-blue mb-1">{template.name}</h3>
                <Badge variant="blue">{template.category}</Badge>
              </div>
              <div className="w-10 h-10 bg-aa-orange/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <FontAwesomeIcon icon={faFileLines} className="text-aa-orange" style={{ fontSize: 20 }} />
              </div>
            </div>
            
            <div className="flex-1 mb-4">
              <p className="text-sm text-aa-gray bg-gray-50 p-3 rounded-lg">
                {template.content}
              </p>
            </div>

            {Array.isArray(template.variables) && template.variables.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-aa-gray uppercase mb-2">Variables:</p>
                <div className="flex flex-wrap gap-1">
                  {template.variables.map((variable, idx) => (
                    <span key={idx} className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded">
                      {`{{${variable}}}`}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 pt-4 border-t border-gray-100">
              <button className="flex items-center gap-1 text-aa-orange hover:underline text-sm font-semibold">
                <FontAwesomeIcon icon={faCopy} style={{ fontSize: 14 }} />
                Copy
              </button>
              <button className="flex items-center gap-1 text-aa-dark-blue hover:underline text-sm font-semibold">
                <FontAwesomeIcon icon={faPenToSquare} style={{ fontSize: 14 }} />
                Edit
              </button>
              <button className="flex items-center gap-1 text-red-600 hover:underline text-sm font-semibold ml-auto">
                <FontAwesomeIcon icon={faTrashCan} style={{ fontSize: 14 }} />
                Delete
              </button>
            </div>
          </Card>
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center">
          <button
            onClick={() => fetchTemplates({ reset: false, nextOffset: offset })}
            disabled={loadingMore}
            className="px-5 py-2 rounded-full border border-aa-orange text-aa-orange font-semibold hover:bg-aa-orange hover:text-white transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loadingMore ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}

      {/* Create Template Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create Message Template">
        <form onSubmit={handleCreateTemplate} className="space-y-4">
          <Input
            label="Template Name"
            value={newTemplate.name}
            onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
            placeholder="e.g., Welcome Message"
            required
          />
          
          <div>
            <label className="block text-sm font-semibold text-aa-text-dark mb-2">Category</label>
            <select
              value={newTemplate.category}
              onChange={(e) => setNewTemplate({ ...newTemplate, category: e.target.value })}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg outline-none focus:border-aa-orange"
              required
            >
              <option value="">Select Category</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-aa-text-dark mb-2">Message Content</label>
            <textarea
              value={newTemplate.content}
              onChange={(e) => setNewTemplate({ ...newTemplate, content: e.target.value })}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg outline-none focus:border-aa-orange"
              rows="5"
              placeholder="Type your template message... Use {{variableName}} for dynamic content"
              required
            />
          </div>

          <Input
            label="Variables (comma separated)"
            value={newTemplate.variables}
            onChange={(e) => setNewTemplate({ ...newTemplate, variables: e.target.value })}
            placeholder="name, product, date"
          />

          <div className="bg-blue-50 p-4 rounded-lg">
            <p className="text-xs font-semibold text-aa-dark-blue mb-1">Tip:</p>
            <p className="text-xs text-aa-gray">
              Use double curly braces for variables: {`{{name}}`}, {`{{product}}`}
            </p>
          </div>

          <div className="flex gap-3">
            <Button type="submit" variant="primary" className="flex-1">Create Template</Button>
            <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)} className="flex-1">
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
