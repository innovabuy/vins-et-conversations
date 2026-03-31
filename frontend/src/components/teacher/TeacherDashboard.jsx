import { useState, useEffect } from 'react';
import { dashboardAPI } from '../../services/api';
import { Users, Target, AlertTriangle, BarChart3, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);
const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';

/**
 * Teacher Dashboard — CDC §4.6 (amendement Nicolas : CA action + detail etudiants)
 * L'enseignant voit : CA global, ventilation TVA, remuneration asso, detail par etudiant.
 * NE voit PAS : prix produits, marges, commissions individuelles.
 */
export default function TeacherDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [classFilter, setClassFilter] = useState('all');
  const [expandedStudent, setExpandedStudent] = useState(null);

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

  const { progress, totalStudents, classGroups, classTotals, students, inactiveStudents, campaign_financials } = data;

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

      {/* CA de l'action */}
      {campaign_financials && (
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-wine-700" />
            <h3 className="font-semibold">CA de l'action</h3>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-wine-50 rounded-lg p-4 text-center">
              <p className="text-xs text-gray-500">CA TTC</p>
              <p className="text-2xl font-bold text-wine-700">{formatEur(campaign_financials.ca_ttc)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <p className="text-xs text-gray-500">CA HT</p>
              <p className="text-2xl font-bold text-gray-700">{formatEur(campaign_financials.ca_ht)}</p>
            </div>
          </div>
          {campaign_financials.vat_breakdown?.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-2">Ventilation TVA</p>
              <div className="border rounded-lg divide-y text-sm">
                {campaign_financials.vat_breakdown.map((v) => (
                  <div key={v.rate} className="flex justify-between px-3 py-2">
                    <span className="text-gray-600">TVA {v.rate}%</span>
                    <span>HT {formatEur(v.amount_ht)} — TTC {formatEur(v.amount_ttc)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {campaign_financials.association_remuneration && campaign_financials.association_remuneration.rate_percent > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm font-medium text-green-800">
                Remuneration association ({campaign_financials.association_remuneration.rate_percent}% du CA HT)
              </p>
              <p className="text-xl font-bold text-green-700">{formatEur(campaign_financials.association_remuneration.amount_ht)}</p>
            </div>
          )}
        </div>
      )}

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
          <p className="text-sm text-amber-700 mb-2">Ces élèves n'ont pas vendu depuis plus de {data.inactivityThreshold || 7} jours :</p>
          <div className="flex flex-wrap gap-2">
            {inactiveStudents.map((name) => (
              <span key={name} className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded">{name}</span>
            ))}
          </div>
        </div>
      )}

      {/* Student detail — with CA */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-wine-700" />
            <h3 className="font-semibold">Detail par etudiant</h3>
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

        <div className="space-y-1">
          {filteredStudents.map((s) => {
            const expanded = expandedStudent === s.id;
            return (
              <div key={s.id || s.name} className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedStudent(expanded ? null : s.id)}
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-50 text-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-6 text-center text-xs font-bold text-gray-400">{s.rank}</span>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{s.name}</p>
                      <p className="text-xs text-gray-500">{s.classGroup} — {s.salesCount} ventes, {s.bottlesSold} bout.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-semibold text-wine-700">{formatEur(s.ca_ttc || 0)}</span>
                    {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                  </div>
                </button>
                {expanded && (
                  <div className="border-t px-4 py-3 bg-gray-50 text-sm space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-500">CA HT</span>
                      <span className="font-medium">{formatEur(s.ca_ht || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">CA TTC</span>
                      <span className="font-medium">{formatEur(s.ca_ttc || 0)}</span>
                    </div>
                    {s.vat_breakdown?.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Ventilation TVA</p>
                        {s.vat_breakdown.map((v) => (
                          <div key={v.rate} className="flex justify-between text-xs">
                            <span className="text-gray-500">TVA {v.rate}%</span>
                            <span>HT {formatEur(v.amount_ht)} — TTC {formatEur(v.amount_ttc)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex justify-between text-xs text-gray-400 pt-1 border-t">
                      <span>Derniere commande</span>
                      <span>{formatDate(s.last_order_date)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {filteredStudents.length === 0 && (
            <p className="py-4 text-center text-gray-400 text-sm">Aucune vente pour le moment</p>
          )}
        </div>
      </div>
    </div>
  );
}
