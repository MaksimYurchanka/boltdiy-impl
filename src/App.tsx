import React, { useState } from 'react';
import { Send, Code, AlertCircle, Trash2, RefreshCw } from 'lucide-react';

interface ApiResponse {
  success: boolean;
  taskId?: string;
  status?: string;
  implementation?: string;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

function App() {
  const [prompt, setPrompt] = useState('');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/v1/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer YOUR_API_KEY',
        },
        body: JSON.stringify({ prompt }),
      });

      const data = await response.json();
      setResult(data);
      if (data.success && data.taskId) {
        setTaskId(data.taskId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const checkStatus = async () => {
    if (!taskId) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/tasks/${taskId}/status`, {
        headers: {
          'Authorization': 'Bearer YOUR_API_KEY',
        },
      });
      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const deleteTask = async () => {
    if (!taskId) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/tasks/${taskId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer YOUR_API_KEY',
        },
      });
      const data = await response.json();
      if (data.success) {
        setTaskId(null);
        setResult(null);
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <Code className="mx-auto h-12 w-12 text-indigo-600" />
          <h1 className="mt-3 text-3xl font-extrabold text-gray-900 sm:text-4xl">
            AI-AutoCoding-DAO
          </h1>
          <p className="mt-3 max-w-2xl mx-auto text-xl text-gray-500 sm:mt-4">
            Implementation Layer API Testing Interface
          </p>
        </div>

        <div className="mt-12 bg-white rounded-lg shadow px-5 py-6 sm:px-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="prompt" className="block text-sm font-medium text-gray-700">
                Implementation Prompt
              </label>
              <div className="mt-1">
                <textarea
                  id="prompt"
                  name="prompt"
                  rows={4}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Enter your implementation request..."
                />
              </div>
            </div>

            <div className="flex space-x-4">
              <button
                type="submit"
                disabled={loading}
                className={`flex-1 flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                  loading
                    ? 'bg-indigo-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
                }`}
              >
                {loading ? (
                  'Processing...'
                ) : (
                  <>
                    <Send className="h-5 w-5 mr-2" />
                    Submit Request
                  </>
                )}
              </button>

              {taskId && (
                <>
                  <button
                    type="button"
                    onClick={checkStatus}
                    disabled={loading}
                    className="flex-none flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                  >
                    <RefreshCw className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={deleteTask}
                    disabled={loading}
                    className="flex-none flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>
          </form>

          {error && (
            <div className="mt-6 bg-red-50 border-l-4 border-red-400 p-4">
              <div className="flex">
                <AlertCircle className="h-5 w-5 text-red-400" />
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">Error</h3>
                  <div className="mt-2 text-sm text-red-700">{error}</div>
                </div>
              </div>
            </div>
          )}

          {result && (
            <div className="mt-6 bg-green-50 border-l-4 border-green-400 p-4">
              <div className="flex">
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-green-800">
                    {result.success ? 'Success!' : 'Error'}
                  </h3>
                  <div className="mt-2 text-sm text-green-700">
                    {result.success
                      ? (
                        <div>
                          {result.taskId && <div>Task ID: {result.taskId}</div>}
                          {result.status && <div>Status: {result.status}</div>}
                          {result.implementation && (
                            <div>
                              <div className="font-semibold mt-2">Implementation:</div>
                              <pre className="mt-2 whitespace-pre-wrap">{result.implementation}</pre>
                            </div>
                          )}
                        </div>
                      )
                      : result.error?.message}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;