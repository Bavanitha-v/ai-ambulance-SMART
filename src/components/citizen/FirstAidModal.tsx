"use client";

import { useState } from "react";
import {
  ShieldAlert,
  HeartPulse,
  Activity,
  Flame,
  AlertTriangle,
  X,
  PhoneCall,
  Info,
  CheckCircle2,
} from "lucide-react";

interface FirstAidModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCategory?: string;
}

export function FirstAidModal({
  isOpen,
  onClose,
  initialCategory = "cardiac",
}: FirstAidModalProps) {
  const [selectedTopic, setSelectedTopic] = useState<string>(initialCategory);
  const [cprCount, setCprCount] = useState<number>(0);
  const [cprActive, setCprActive] = useState<boolean>(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-600/20 text-red-400 flex items-center justify-center">
              <HeartPulse className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Emergency First-Aid Support</h2>
              <p className="text-[11px] text-slate-400">Step-by-step actions while the ambulance is en route</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mandatory Legal & Clinical Disclaimer (Rule #6) */}
        <div className="bg-amber-500/10 border-b border-amber-500/20 p-3.5 px-5 flex items-start gap-3 text-xs text-amber-300">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
          <div className="space-y-0.5 leading-relaxed">
            <p className="font-bold tracking-wide text-amber-200 uppercase text-[11px]">
              General Guidance, Not Medical Advice
            </p>
            <p className="text-[11px] text-amber-300/90">
              This guide provides immediate first-aid instructions for bystanders.{" "}
              <strong>Always follow the emergency operator&apos;s instructions on the 108 phone call.</strong> Do not perform procedures beyond your training.
            </p>
          </div>
        </div>

        {/* Topic Selector Tabs */}
        <div className="flex overflow-x-auto p-2 gap-2 bg-slate-950/40 border-b border-slate-800 text-xs no-scrollbar">
          {[
            { id: "cardiac", label: "Cardiac / CPR", icon: HeartPulse },
            { id: "trauma", label: "Bleeding & Trauma", icon: Activity },
            { id: "stroke", label: "Stroke (FAST)", icon: ShieldAlert },
            { id: "respiratory", label: "Choking & Airway", icon: AlertTriangle },
            { id: "burns", label: "Burns & Scalds", icon: Flame },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = selectedTopic === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedTopic(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition ${
                  active
                    ? "bg-red-600 text-white shadow-sm shadow-red-600/30"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs text-slate-300">
          {selectedTopic === "cardiac" && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-red-950/30 border border-red-800/40">
                <h3 className="font-bold text-red-300 text-sm mb-1">Unresponsive & Not Breathing Normally:</h3>
                <p className="text-slate-300 text-xs leading-relaxed">
                  Start hands-only CPR immediately. Push hard and fast in the center of the chest at <strong>100–120 compressions per minute</strong>.
                </p>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-white font-bold flex items-center justify-center shrink-0 text-[10px]">
                    1
                  </span>
                  <div>
                    <strong className="text-white">Position the patient:</strong> Lay the person flat on their back on a firm surface. Kneel beside their chest.
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-white font-bold flex items-center justify-center shrink-0 text-[10px]">
                    2
                  </span>
                  <div>
                    <strong className="text-white">Hand placement:</strong> Place the heel of one hand in the center of the chest. Interlock your other hand on top. Keep elbows straight.
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-white font-bold flex items-center justify-center shrink-0 text-[10px]">
                    3
                  </span>
                  <div>
                    <strong className="text-white">Compress:</strong> Push down at least 2 inches (5 cm) deep. Allow chest to recoil fully between pushes. Do not stop until the paramedic arrives or the person wakes up.
                  </div>
                </div>
              </div>

              {/* CPR Rhythm Metronome Helper */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-white">CPR Rhythm Guide (110 BPM)</div>
                  <div className="text-[11px] text-slate-400">Match compressions to the disco hit &apos;Stayin&apos; Alive&apos;</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCprActive(!cprActive);
                    if (!cprActive) setCprCount(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg font-semibold text-xs transition ${
                    cprActive
                      ? "bg-red-600 text-white animate-pulse"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-200"
                  }`}
                >
                  {cprActive ? "Rhythm Active" : "Start Rhythm Helper"}
                </button>
              </div>
            </div>
          )}

          {selectedTopic === "trauma" && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <h3 className="font-bold text-white text-sm mb-1">Severe Bleeding & Penetrating Injury</h3>
                <p className="text-slate-400 text-xs">Direct pressure is the single most effective action to prevent exsanguination.</p>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-white font-bold flex items-center justify-center shrink-0 text-[10px]">
                    1
                  </span>
                  <div>
                    <strong className="text-white">Apply Direct Pressure:</strong> Place a clean cloth, towel, or sterile dressing directly over the wound. Press firmly with both hands.
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-white font-bold flex items-center justify-center shrink-0 text-[10px]">
                    2
                  </span>
                  <div>
                    <strong className="text-white">Do NOT remove the dressing:</strong> If blood soaks through, add more layers on top. Removing the base cloth dislodges clotting factors.
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-white font-bold flex items-center justify-center shrink-0 text-[10px]">
                    3
                  </span>
                  <div>
                    <strong className="text-red-400">Do NOT remove penetrating objects:</strong> If a knife, rod, or glass is impaled, leave it in place. Stabilize it with rolled towels.
                  </div>
                </div>
              </div>
            </div>
          )}

          {selectedTopic === "stroke" && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-800/40">
                <h3 className="font-bold text-amber-300 text-sm mb-1">F.A.S.T. Stroke Assessment</h3>
                <p className="text-slate-300 text-xs">Every minute counts. Note the exact time when symptoms were first observed.</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <strong className="text-amber-400 block mb-1">F - Face Drooping</strong>
                  <span>Ask them to smile. Does one side of the face droop or feel numb?</span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <strong className="text-amber-400 block mb-1">A - Arm Weakness</strong>
                  <span>Ask them to raise both arms. Does one arm drift downward?</span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <strong className="text-amber-400 block mb-1">S - Speech Difficulty</strong>
                  <span>Is speech slurred or strange? Ask them to repeat a simple sentence.</span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <strong className="text-amber-400 block mb-1">T - Time to Dispatch</strong>
                  <span>Check clock and report time of onset to the paramedic immediately.</span>
                </div>
              </div>

              <div className="text-[11px] text-red-400 bg-red-500/10 p-2.5 rounded-lg border border-red-500/20">
                ⚠️ <strong>Do NOT give aspirin, food, or water</strong> until a hospital CT scan has ruled out hemorrhagic stroke.
              </div>
            </div>
          )}

          {selectedTopic === "respiratory" && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <h3 className="font-bold text-white text-sm mb-1">Airway Obstruction & Choking</h3>
                <p className="text-slate-400 text-xs">If the person can cough or speak, encourage them to cough. If silent:</p>
              </div>

              <div className="space-y-2">
                <p>• <strong>5 Back Blows:</strong> Lean the person forward and give 5 firm blows between shoulder blades with heel of hand.</p>
                <p>• <strong>5 Abdominal Thrusts (Heimlich):</strong> Stand behind them, place fist above navel, pull inward and upward.</p>
                <p>• If person becomes unconscious, lower them gently to ground and begin CPR chest compressions.</p>
              </div>
            </div>
          )}

          {selectedTopic === "burns" && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <h3 className="font-bold text-white text-sm mb-1">Thermal & Chemical Burns</h3>
                <p className="text-slate-400 text-xs">Immediate cooling reduces tissue damage depth.</p>
              </div>

              <div className="space-y-2">
                <p>• <strong>Cool with clean running water:</strong> For 10 to 20 minutes. Do NOT use ice water or ice cubes.</p>
                <p>• <strong>Remove constricting items:</strong> Take off rings, watches, or tight clothes before swelling begins.</p>
                <p>• <strong>Cover cleanly:</strong> Use sterile dressing or clean cling film loosely. Do NOT apply ointments, butter, or toothpaste.</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <a
            href="tel:108"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-lg shadow-red-600/30 transition"
          >
            <PhoneCall className="w-4 h-4 animate-pulse" />
            <span>Call 108 Emergency Operator</span>
          </a>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition"
          >
            Back to Live Tracker
          </button>
        </div>
      </div>
    </div>
  );
}
