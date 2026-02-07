import { useState, useEffect } from 'react';
import { dashboardAPI } from '../../services/api';
import { Users, Target, AlertTriangle, BarChart3 } from 'lucide-react';

/**
 * Teacher Dashboard — CDC §4.6
 * CRITICAL: No euro amounts (€) anywhere in this component.
 * Teacher sees: progress %, bottles sold, sales count, inactivity alerts.
 */
export default function TeacherDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [classFilter, setClassFilter] = useState('all');

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const res = await dashboardAPI.teacher();
      setData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" /></div>;
  }

  if (!data) return <p className="text-center text-gray-500 py-12">Impossible de charger le tableau de bord.</p>;

  const { progress, totalStudents, classGroups, classTotals, students, inactiveStudents } = data;

  // Filter students by class
  const filteredStudents = classFilter === 'all'
    ? students
    : students.filter((s) => s.classGroup === classFilter);

  // Progress gauge color
  const gaugeColor = progress >= 75 ? 'text-green-600' : progress >= 50 ? 'text-amber-600' : 'text-red-500';
  const gaugeBg = progress >= 75 ? 'bg-green-500' : progress >= 50 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="space-y-6">
      {/* Progress gauge */}
      <div className="card text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Target size={20} className="text-wine-700" />
          <h2 className="font-semibold text-lg">Progression de la campagne</h2>
        </div>
        <div className="relative w-32 h-32 mx-auto mb-3">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle cx="50" cy="50" r="42" fill="none" stroke="#e5e7eb" strokeWidth="8" />
            <circle
              cx="50" cy="50" r="42" fill="none"
              stroke={progress >= 75 ? '#22c55e' : progress >= 50 ? '#f59e0b' : '#ef4444'}
              strokeWidth="8"
              strokeDasharray={`${(progress / 100) * 264} 264`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-2xl font-bold ${gaugeColor}`}>{progress}%</span>
          </div>
        </div>
        <p className="text-sm text-gray-500">{totalStudents} élèves participent</p>
      </div>

      {/* Class group comparison */}
      {classGroups && classGroups.length > 1 && classTotals && (
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={18} className="text-wine-700" />
            <h3 className="font-semibold">Comparaison par classe</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {classGroups.map((cg) => {
              const ct = classTotals[cg] || { bottles: 0, salesCount: 0, studentCount: 0 };
              return (
                <div key={cg} className="bg-gray-50 rounded-lg p-4 text-center">
                  <h4 className="font-bold text-wine-700 text-lg mb-2">{cg}</h4>
                  <div className="space-y-1">
                    <div>
                      <span className="text-xl font-bold">{ct.bottles}</span>
                      <p className="text-xs text-gray-500">bouteilles vendues</p>
                    </div>
                    <div>
                      <span className="text-lg font-semibold text-gray-700">{ct.salesCount}</span>
                      <p className="text-xs text-gray-500">ventes</p>
                    </div>
                    <p className="text-xs text-gray-400">{ct.studentCount} élèves</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Inactivity alerts */}
      {inactiveStudents && inactiveStudents.length > 0 && (
        <div className="card bg-amber-50 border-amber-200">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-amber-600" />
            <h3 className="font-semibold text-amber-800">Alertes inactivité</h3>
            <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">{inactiveStudents.length}</span>
          </div>
          <p className="text-sm text-amber-700 mb-2">Ces élèves n'ont pas vendu depuis plus de 7 jours :</p>
          <div className="flex flex-wrap gap-2">
            {inactiveStudents.map((name) => (
              <span key={name} className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded">{name}</span>
            ))}
          </div>
        </div>
      )}

      {/* Student ranking — NO euros */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-wine-700" />
            <h3 className="font-semibold">Classement des élèves</h3>
          </div>
          {classGroups && classGroups.length > 1 && (
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="text-sm border rounded px-2 py-1"
            >
              <option value="all">Toutes classes</option>
              {classGroups.map((cg) => (
                <option key={cg} value={cg}>{cg}</option>
              ))}
            </select>
          )}
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2 w-8">#</th>
              <th className="py-2">Nom</th>
              {classGroups && classGroups.length > 1 && <th className="py-2">Classe</th>}
              <th className="py-2 text-right">Ventes</th>
              <th className="py-2 text-right">Bouteilles</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map((s, i) => (
              <tr key={`${s.name}-${i}`} className="border-b hover:bg-gray-50">
                <td className="py-2 text-gray-400">{i + 1}</td>
                <td className="py-2 font-medium">{s.name}</td>
                {classGroups && classGroups.length > 1 && (
                  <td className="py-2">
                    <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{s.classGroup}</span>
                  </td>
                )}
                <td className="py-2 text-right">{s.salesCount}</td>
                <td className="py-2 text-right font-medium">{s.bottlesSold}</td>
              </tr>
            ))}
            {filteredStudents.length === 0 && (
              <tr><td colSpan={5} className="py-4 text-center text-gray-400">Aucune vente pour le moment</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
