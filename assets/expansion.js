/**
 * GVCN PRO - EXPANSION ENGINE (GIAI ĐOẠN 1, 2, 3)
 * Tích hợp toàn diện:
 * - GĐ 1: Trợ lý AI Gemini (Soạn nhận xét TT22/TT27, tin nhắn Zalo, kịch bản sinh hoạt, cảnh báo sớm) + VnEdu/SMAS Excel.
 * - GĐ 2: Sơ đồ lớp học kéo-thả & Luân chuyển 2 tuần/lần + Biên bản sinh hoạt lớp xuất Word (.doc) + Học sinh cần quan tâm.
 * - GĐ 3: PWA Offline + Chế độ Trình chiếu TV/Máy chiếu (Theater Mode) + Thẻ in Mã QR Tra cứu Phụ huynh.
 */

(function () {
  if (window.__gvcnExpansionInstalled) return;
  window.__gvcnExpansionInstalled = true;

  // --- 1. PWA SERVICE WORKER REGISTRATION ---
  if ('serviceWorker' in navigator && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then(() => {
        console.log('[GVCN PWA] Service Worker đăng ký thành công.');
      }).catch(err => {
        console.warn('[GVCN PWA] Service Worker không đăng ký được:', err);
      });
    });
  }

  let deferredInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const installBtn = document.getElementById('pwa-install-app-btn');
    if (installBtn) installBtn.style.display = 'inline-flex';
  });

  window.installPwaApp = function () {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice.then(choice => {
        if (choice.outcome === 'accepted') {
          console.log('[GVCN PWA] Người dùng đã cài đặt ứng dụng.');
        }
        deferredInstallPrompt = null;
        const installBtn = document.getElementById('pwa-install-app-btn');
        if (installBtn) installBtn.style.display = 'none';
      });
    } else {
      alert('Để cài đặt ứng dụng: Trên Chrome/Edge chọn menu (⋮) -> "Cài đặt ứng dụng", hoặc trên iPhone Safari chọn nút Chia sẻ (Share) -> "Thêm vào màn hình chính".');
    }
  };

  // --- 2. HELPERS ---
  function safeVal(val, def = '') {
    return val !== undefined && val !== null ? String(val) : def;
  }
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getActiveStudents() {
    return (window.state && Array.isArray(window.state.students)) ? window.state.students : [];
  }
  function getClassInfo() {
    const admin = (window.state && window.state.admin) || {};
    return {
      className: admin.className || 'Lớp 12A1',
      teacherName: admin.name || 'Giáo viên',
      schoolName: admin.schoolName || 'Trường THPT'
    };
  }

  // --- 3. MODAL HOST SYSTEM ---
  function getModalContainer() {
    let host = document.getElementById('expansion-modal-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'expansion-modal-host';
      host.className = 'print:hidden';
      document.body.appendChild(host);
    }
    return host;
  }

  window.closeExpansionModal = function () {
    const host = getModalContainer();
    host.innerHTML = '';
  };

  // ==========================================
  // PHASE 1: TRỢ LÝ AI GEMINI (GVCN COPILOT)
  // ==========================================
  window.openAiModal = function (initialTab = 'nhan-xet') {
    const host = getModalContainer();
    const students = getActiveStudents();
    const classInfo = getClassInfo();
    const savedApiKey = (window.state && window.state.settings && window.state.settings.geminiApiKey) || '';

    host.innerHTML = `
      <div class="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn">
        <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800">
          
          <!-- Modal Header -->
          <div class="p-4 sm:p-5 bg-gradient-to-r from-emerald-700 via-teal-700 to-emerald-800 text-white flex items-center justify-between flex-shrink-0">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-2xl shadow-inner">🤖</div>
              <div>
                <h3 class="text-lg font-black tracking-tight flex items-center gap-2">
                  Trợ Lý AI GVCN PRO
                  <span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/40 text-emerald-100 border border-emerald-400/30">Google GenAI v5.0</span>
                </h3>
                <p class="text-xs text-emerald-100/90 font-medium">Soạn nhận xét học bạ TT 22/27, tin nhắn Zalo phụ huynh, kịch bản sinh hoạt lớp & cảnh báo sớm</p>
              </div>
            </div>
            <button onclick="closeExpansionModal()" class="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition" title="Đóng">
              <i class="ph-bold ph-x text-lg"></i>
            </button>
          </div>

          <!-- Nav Tabs -->
          <div class="flex border-b border-slate-200 bg-slate-50 px-3 sm:px-5 pt-2 gap-1 overflow-x-auto custom-scrollbar flex-shrink-0">
            <button onclick="switchAiTab('nhan-xet')" id="ai-tab-btn-nhan-xet" class="ai-tab-btn px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-bold border-b-2 border-emerald-600 text-emerald-700 bg-white shadow-sm flex items-center gap-2">
              <i class="ph-fill ph-notebook"></i> Nhận xét Học bạ (TT22/27)
            </button>
            <button onclick="switchAiTab('zalo')" id="ai-tab-btn-zalo" class="ai-tab-btn px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-2">
              <i class="ph-bold ph-chat-teardrop-dots"></i> Tin nhắn Zalo PH
            </button>
            <button onclick="switchAiTab('sinh-hoat')" id="ai-tab-btn-sinh-hoat" class="ai-tab-btn px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-2">
              <i class="ph-bold ph-users-three"></i> Kịch bản 45p Sinh hoạt
            </button>
            <button onclick="switchAiTab('canh-bao')" id="ai-tab-btn-canh-bao" class="ai-tab-btn px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-2">
              <i class="ph-bold ph-warning-circle"></i> Cảnh báo sớm
            </button>
            <button onclick="switchAiTab('cai-dat-ai')" id="ai-tab-btn-cai-dat-ai" class="ai-tab-btn px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-2">
              <i class="ph-bold ph-key"></i> Khóa API
            </button>
          </div>

          <!-- Tab Content Area -->
          <div class="p-4 sm:p-6 overflow-y-auto custom-scrollbar flex-1 bg-slate-50/50">
            
            <!-- TAB 1: NHẬN XÉT HỌC BẠ -->
            <div id="ai-panel-nhan-xet" class="ai-panel">
              <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-4">
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                  <div>
                    <label class="block text-xs font-bold text-slate-600 mb-1">Quy chuẩn Thông tư:</label>
                    <select id="ai-comment-criteria" class="w-full text-xs font-semibold p-2.5 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500">
                      <option value="tt22">Thông tư 22/2021 (THCS & THPT)</option>
                      <option value="tt27">Thông tư 27/2020 (Tiểu học)</option>
                    </select>
                  </div>
                  <div>
                    <label class="block text-xs font-bold text-slate-600 mb-1">Thời điểm nhận xét:</label>
                    <input type="text" id="ai-comment-month" value="Tháng 10" class="w-full text-xs font-semibold p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500" placeholder="VD: Giữa HK1, Tháng 10..." />
                  </div>
                  <div class="flex items-end">
                    <button onclick="generateAiCommentsAction()" id="btn-generate-ai-comments" class="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition">
                      <i class="ph-bold ph-sparkle text-amber-300 text-sm"></i> Tạo nhận xét toàn lớp (${students.length} HS)
                    </button>
                  </div>
                </div>
                <p class="text-[11px] text-slate-500 italic">
                  💡 AI sẽ tự động phân tích điểm thi đua, chuyên cần và thái độ để viết lời nhận xét theo 5 phẩm chất (Yêu nước, Nhân ái, Chăm chỉ, Trung thực, Trách nhiệm) và năng lực cốt lõi.
                </p>
              </div>

              <div id="ai-comments-loading" class="hidden text-center py-10">
                <div class="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                <p class="text-xs font-bold text-emerald-800">Trợ lý AI đang phân tích dữ liệu và soạn thảo nhận xét sư phạm...</p>
              </div>

              <div id="ai-comments-results" class="hidden">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs font-black text-slate-700" id="ai-comments-count-label">Danh sách nhận xét:</span>
                  <div class="flex gap-2">
                    <button onclick="applyAiCommentsToClassState()" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm">
                      <i class="ph-bold ph-check"></i> Lưu vào Báo cáo nhận xét
                    </button>
                    <button onclick="copyAiCommentsText()" class="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold flex items-center gap-1">
                      <i class="ph-bold ph-copy"></i> Sao chép
                    </button>
                  </div>
                </div>
                <div id="ai-comments-table-container" class="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white max-h-[50vh] overflow-y-auto custom-scrollbar">
                  <!-- Injected via JS -->
                </div>
              </div>
            </div>

            <!-- TAB 2: TIN NHẮN ZALO PHỤ HUYNH -->
            <div id="ai-panel-zalo" class="ai-panel hidden">
              <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-4">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label class="block text-xs font-bold text-slate-600 mb-1">Chọn học sinh:</label>
                    <select id="ai-zalo-student-select" class="w-full text-xs font-semibold p-2.5 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500">
                      ${students.map(s => `<option value="${s.id}">${escapeHtml(s.name)} (Điểm: ${s.points || 0})</option>`).join('')}
                    </select>
                  </div>
                  <div>
                    <label class="block text-xs font-bold text-slate-600 mb-1">Chủ đề tin nhắn:</label>
                    <select id="ai-zalo-type-select" class="w-full text-xs font-semibold p-2.5 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500">
                      <option value="commend">🎉 Khen ngợi tiến bộ / Sao tuần</option>
                      <option value="remind">⚠️ Nhắc nhở nề nếp nhẹ nhàng</option>
                      <option value="attendance">⏰ Thông báo vắng / muộn học</option>
                      <option value="fund">💰 Nhắc nhở đóng góp quỹ lớp</option>
                      <option value="general">📢 Thông báo tình hình chung</option>
                    </select>
                  </div>
                </div>
                <div class="mb-3">
                  <label class="block text-xs font-bold text-slate-600 mb-1">Ghi chú bổ sung (tùy chọn):</label>
                  <input type="text" id="ai-zalo-note" placeholder="VD: Con dạo này hay quên mang sách vở môn Toán..." class="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500" />
                </div>
                <button onclick="generateAiZaloAction()" id="btn-generate-ai-zalo" class="py-2 px-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-md">
                  <i class="ph-bold ph-paper-plane-tilt"></i> Soạn tin nhắn chuẩn sư phạm
                </button>
              </div>

              <div id="ai-zalo-result-container" class="hidden bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs font-bold text-slate-700 flex items-center gap-1.5"><i class="ph-fill ph-chat-centered-text text-emerald-600"></i> Nội dung tin nhắn:</span>
                  <div class="flex gap-2">
                    <button onclick="copyAiZaloText()" class="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold flex items-center gap-1">
                      <i class="ph-bold ph-copy"></i> Sao chép tin
                    </button>
                    <a id="ai-zalo-web-link" href="https://chat.zalo.me" target="_blank" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm">
                      <i class="ph-bold ph-arrow-square-out"></i> Mở Zalo Web
                    </a>
                  </div>
                </div>
                <textarea id="ai-zalo-output-text" rows="7" class="w-full text-xs font-sans p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 leading-relaxed custom-scrollbar"></textarea>
              </div>
            </div>

            <!-- TAB 3: KỊCH BẢN TIẾT SINH HOẠT LỚP 45 PHÚT -->
            <div id="ai-panel-sinh-hoat" class="ai-panel hidden">
              <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-4">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label class="block text-xs font-bold text-slate-600 mb-1">Chủ điểm sinh hoạt tuần:</label>
                    <input type="text" id="ai-meeting-theme" value="An toàn giao thông và Xây dựng tình bạn đẹp" class="w-full text-xs font-semibold p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label class="block text-xs font-bold text-slate-600 mb-1">Tuần học thứ:</label>
                    <input type="number" id="ai-meeting-week" value="5" min="1" max="40" class="w-full text-xs font-semibold p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500" />
                  </div>
                </div>
                <button onclick="generateAiMeetingAction()" id="btn-generate-ai-meeting" class="py-2.5 px-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-md">
                  <i class="ph-bold ph-sparkle text-amber-300"></i> Lập kịch bản 45 phút chi tiết
                </button>
              </div>

              <div id="ai-meeting-result-container" class="hidden bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs font-bold text-slate-700">Kịch bản chi tiết:</span>
                  <div class="flex gap-2">
                    <button onclick="copyAiMeetingText()" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold flex items-center gap-1">
                      <i class="ph-bold ph-copy"></i> Sao chép
                    </button>
                    <button onclick="exportWordFromText('Kich_Ban_Sinh_Hoat_Lop', document.getElementById('ai-meeting-output-text').value)" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm">
                      <i class="ph-bold ph-file-doc"></i> Tải file Word (.doc)
                    </button>
                  </div>
                </div>
                <textarea id="ai-meeting-output-text" rows="12" class="w-full text-xs font-mono p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 leading-relaxed custom-scrollbar"></textarea>
              </div>
            </div>

            <!-- TAB 4: CẢNH BÁO SỚM HỌC SINH -->
            <div id="ai-panel-canh-bao" class="ai-panel hidden">
              <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-4 flex items-center justify-between">
                <div>
                  <h4 class="text-xs font-black text-slate-800 uppercase tracking-wider mb-1">Rà soát nguy cơ nề nếp & chuyên cần</h4>
                  <p class="text-xs text-slate-500">Tự động phát hiện các học sinh có điểm âm, vắng không phép nhiều, hoặc có dấu hiệu sa sút.</p>
                </div>
                <button onclick="runAiEarlyWarningAction()" class="py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-md">
                  <i class="ph-bold ph-magnifying-glass"></i> Quét & Phân tích ngay
                </button>
              </div>
              <div id="ai-warning-result-container" class="hidden">
                <!-- Injected via JS -->
              </div>
            </div>

            <!-- TAB 5: CÀI ĐẶT API KEY -->
            <div id="ai-panel-cai-dat-ai" class="ai-panel hidden">
              <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm max-w-xl mx-auto">
                <h4 class="text-sm font-black text-slate-800 mb-2 flex items-center gap-2">
                  <i class="ph-fill ph-key text-emerald-600"></i> Cấu hình Google Gemini API Key
                </h4>
                <p class="text-xs text-slate-600 leading-relaxed mb-4">
                  Ứng dụng sử dụng chuẩn <strong>Google AI SDK v5.0</strong>. Thầy/Cô có thể nhập API Key miễn phí từ <a href="https://aistudio.google.com/app/apikey" target="_blank" class="text-emerald-600 font-bold underline">Google AI Studio</a> để tăng tốc độ phản hồi và sử dụng model mạnh mẽ nhất (<code>gemini-3.8-flash</code>).
                </p>
                <div class="mb-4">
                  <label class="block text-xs font-bold text-slate-700 mb-1">Gemini API Key của Thầy/Cô:</label>
                  <input type="password" id="ai-custom-api-key" value="${escapeHtml(savedApiKey)}" placeholder="AIzaSy..." class="w-full text-xs font-mono p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div class="flex gap-2">
                  <button onclick="saveAiApiKeyAction()" class="py-2.5 px-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-sm">
                    <i class="ph-bold ph-check"></i> Lưu khóa API
                  </button>
                  <button onclick="testAiConnectionAction()" class="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-2 border border-slate-300">
                    <i class="ph-bold ph-plugs"></i> Kiểm tra kết nối
                  </button>
                </div>
                <div id="ai-key-status" class="mt-3 text-xs font-bold"></div>
              </div>
            </div>

          </div>

          <!-- Modal Footer -->
          <div class="p-3 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 flex-shrink-0">
            <span class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Sẵn sàng hỗ trợ công tác chủ nhiệm
            </span>
            <button onclick="closeExpansionModal()" class="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg transition">Đóng</button>
          </div>

        </div>
      </div>
    `;

    switchAiTab(initialTab);
  };

  window.switchAiTab = function (tabId) {
    document.querySelectorAll('.ai-tab-btn').forEach(btn => {
      btn.className = 'ai-tab-btn px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-2 transition';
    });
    const activeBtn = document.getElementById(`ai-tab-btn-${tabId}`);
    if (activeBtn) {
      activeBtn.className = 'ai-tab-btn px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-bold border-b-2 border-emerald-600 text-emerald-700 bg-white shadow-sm flex items-center gap-2 transition';
    }
    document.querySelectorAll('.ai-panel').forEach(panel => panel.classList.add('hidden'));
    const activePanel = document.getElementById(`ai-panel-${tabId}`);
    if (activePanel) activePanel.classList.remove('hidden');
  };

  // AI Actions
  let latestAiComments = [];

  window.generateAiCommentsAction = async function () {
    const students = getActiveStudents();
    if (!students || students.length === 0) {
      alert('Chưa có danh sách học sinh để tạo nhận xét.');
      return;
    }
    const criteria = document.getElementById('ai-comment-criteria')?.value || 'tt22';
    const month = document.getElementById('ai-comment-month')?.value || 'Tháng này';
    const apiKey = (window.state && window.state.settings && window.state.settings.geminiApiKey) || '';

    const btn = document.getElementById('btn-generate-ai-comments');
    const loading = document.getElementById('ai-comments-loading');
    const results = document.getElementById('ai-comments-results');

    if (btn) btn.disabled = true;
    if (loading) loading.classList.remove('hidden');
    if (results) results.classList.add('hidden');

    try {
      const response = await fetch('/api/ai/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students, criteria, month, apiKey })
      });
      const data = await response.json();

      if (data && data.success && Array.isArray(data.comments)) {
        latestAiComments = data.comments;
        renderAiCommentsTable(data.comments, criteria);
        if (results) results.classList.remove('hidden');
      } else {
        alert('Lỗi tạo nhận xét: ' + (data.error || 'Vui lòng thử lại'));
      }
    } catch (err) {
      console.error(err);
      alert('Lỗi kết nối máy chủ AI: ' + err.message);
    } finally {
      if (btn) btn.disabled = false;
      if (loading) loading.classList.add('hidden');
    }
  };

  function renderAiCommentsTable(comments, criteria) {
    const container = document.getElementById('ai-comments-table-container');
    if (!container) return;

    let html = `
      <table class="w-full text-left text-xs border-collapse">
        <thead class="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200">
          <tr>
            <th class="p-2.5 w-10 text-center">STT</th>
            <th class="p-2.5 w-36">Họ và Tên</th>
            <th class="p-2.5">Phẩm chất (5 phẩm chất cốt lõi)</th>
            <th class="p-2.5">Năng lực</th>
            <th class="p-2.5">Lời phê của GVCN</th>
            <th class="p-2.5 w-24 text-center">Đánh giá</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 text-slate-700">
    `;

    comments.forEach((c, idx) => {
      html += `
        <tr class="hover:bg-slate-50/80 transition">
          <td class="p-2.5 text-center font-bold text-slate-400">${idx + 1}</td>
          <td class="p-2.5 font-bold text-slate-900">${escapeHtml(c.name)}</td>
          <td class="p-2.5 leading-relaxed text-slate-600">${escapeHtml(c.phamChat)}</td>
          <td class="p-2.5 leading-relaxed text-slate-600">${escapeHtml(c.nangLuc)}</td>
          <td class="p-2.5 leading-relaxed font-medium text-emerald-800 bg-emerald-50/40">${escapeHtml(c.nhanXetChung)}</td>
          <td class="p-2.5 text-center">
            <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
              ${escapeHtml(c.xepLoaiGoiY || 'Đạt')}
            </span>
          </td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
  }

  window.applyAiCommentsToClassState = function () {
    if (!latestAiComments || latestAiComments.length === 0) return;
    if (!window.state || !Array.isArray(window.state.students)) return;

    let updatedCount = 0;
    const commentMap = new Map(latestAiComments.map(c => [String(c.id), c.nhanXetChung]));

    window.state.students.forEach(s => {
      const comm = commentMap.get(String(s.id));
      if (comm) {
        s.comment = comm;
        updatedCount++;
      }
    });

    if (typeof window.saveLocalState === 'function') window.saveLocalState();
    if (typeof window.syncStateToCloud === 'function') window.syncStateToCloud();
    if (typeof window.renderLayout === 'function') window.renderLayout();

    alert(`Đã tự động cập nhật lời nhận xét của AI cho ${updatedCount} học sinh vào hệ thống!`);
  };

  window.copyAiCommentsText = function () {
    if (!latestAiComments || latestAiComments.length === 0) return;
    const text = latestAiComments.map((c, i) => `${i + 1}. ${c.name}: ${c.nhanXetChung} (${c.xepLoaiGoiY})`).join('\n');
    navigator.clipboard.writeText(text).then(() => alert('Đã sao chép danh sách nhận xét vào bộ nhớ tạm!'));
  };

  window.generateAiZaloAction = async function () {
    const studentId = document.getElementById('ai-zalo-student-select')?.value;
    const type = document.getElementById('ai-zalo-type-select')?.value || 'general';
    const note = document.getElementById('ai-zalo-note')?.value || '';
    const students = getActiveStudents();
    const st = students.find(s => String(s.id) === String(studentId)) || students[0] || {};
    const classInfo = getClassInfo();
    const apiKey = (window.state && window.state.settings && window.state.settings.geminiApiKey) || '';

    const btn = document.getElementById('btn-generate-ai-zalo');
    if (btn) btn.disabled = true;

    try {
      const response = await fetch('/api/ai/zalo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student: st,
          type,
          customNote: note,
          className: classInfo.className,
          teacherName: classInfo.teacherName,
          apiKey
        })
      });
      const data = await response.json();
      if (data && data.success && data.message) {
        const out = document.getElementById('ai-zalo-output-text');
        const cont = document.getElementById('ai-zalo-result-container');
        if (out) out.value = data.message;
        if (cont) cont.classList.remove('hidden');
      } else {
        alert('Lỗi: ' + (data.error || 'Không tạo được tin nhắn'));
      }
    } catch (err) {
      alert('Lỗi gọi API: ' + err.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  window.copyAiZaloText = function () {
    const text = document.getElementById('ai-zalo-output-text')?.value || '';
    if (text) {
      navigator.clipboard.writeText(text).then(() => alert('Đã sao chép tin nhắn Zalo! Hãy mở Zalo và dán (Ctrl+V) gửi phụ huynh.'));
    }
  };

  window.generateAiMeetingAction = async function () {
    const theme = document.getElementById('ai-meeting-theme')?.value || 'An toàn giao thông';
    const week = Number(document.getElementById('ai-meeting-week')?.value || 1);
    const classInfo = getClassInfo();
    const apiKey = (window.state && window.state.settings && window.state.settings.geminiApiKey) || '';
    const students = getActiveStudents();

    const btn = document.getElementById('btn-generate-ai-meeting');
    if (btn) btn.disabled = true;

    try {
      const response = await fetch('/api/ai/meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week,
          theme,
          className: classInfo.className,
          teacherName: classInfo.teacherName,
          classStats: { totalStudents: students.length, issues: 'Nề nếp đầu tuần' },
          apiKey
        })
      });
      const data = await response.json();
      if (data && data.success && data.plan) {
        const out = document.getElementById('ai-meeting-output-text');
        const cont = document.getElementById('ai-meeting-result-container');
        if (out) out.value = data.plan;
        if (cont) cont.classList.remove('hidden');
      } else {
        alert('Lỗi: ' + (data.error || 'Không tạo được kịch bản'));
      }
    } catch (err) {
      alert('Lỗi: ' + err.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  window.copyAiMeetingText = function () {
    const text = document.getElementById('ai-meeting-output-text')?.value || '';
    if (text) {
      navigator.clipboard.writeText(text).then(() => alert('Đã sao chép kịch bản vào bộ nhớ tạm!'));
    }
  };

  window.runAiEarlyWarningAction = async function () {
    const students = getActiveStudents();
    const apiKey = (window.state && window.state.settings && window.state.settings.geminiApiKey) || '';

    try {
      const response = await fetch('/api/ai/early-warning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students, apiKey })
      });
      const data = await response.json();
      const cont = document.getElementById('ai-warning-result-container');
      if (!cont) return;
      cont.classList.remove('hidden');

      if (data && data.success) {
        let html = `
          <div class="bg-amber-50 border border-amber-200 p-4 rounded-xl mb-4">
            <h5 class="text-xs font-black text-amber-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <i class="ph-bold ph-lightbulb text-amber-600"></i> Lời khuyên sư phạm từ Cố vấn AI:
            </h5>
            <p class="text-xs text-amber-800 leading-relaxed font-medium">${escapeHtml(data.advice)}</p>
          </div>
        `;

        if (Array.isArray(data.flagged) && data.flagged.length > 0) {
          html += `
            <div class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div class="p-3 bg-slate-100 font-bold text-xs text-slate-700 border-b border-slate-200">
                Phát hiện ${data.flagged.length} học sinh có dấu hiệu cần hỗ trợ:
              </div>
              <div class="divide-y divide-slate-100 text-xs">
          `;
          data.flagged.forEach(f => {
            html += `
              <div class="p-3 flex items-center justify-between hover:bg-slate-50">
                <div>
                  <span class="font-bold text-slate-800">${escapeHtml(f.name)}</span>
                  <span class="text-slate-400 text-[11px] ml-2">(${escapeHtml(f.group)})</span>
                  <div class="flex gap-1.5 mt-1">
                    ${(f.flags || []).map(fl => `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">${escapeHtml(fl)}</span>`).join('')}
                  </div>
                </div>
                <button onclick="closeExpansionModal(); switchTab('tich-diem');" class="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-lg border border-emerald-200">
                  Xem chi tiết
                </button>
              </div>
            `;
          });
          html += `</div></div>`;
        } else {
          html += `
            <div class="p-6 text-center bg-white rounded-xl border border-slate-200 shadow-sm text-xs font-bold text-emerald-700 flex items-center justify-center gap-2">
              <i class="ph-fill ph-check-circle text-lg"></i> Toàn bộ lớp học đang duy trì nề nếp và chuyên cần rất tốt!
            </div>
          `;
        }
        cont.innerHTML = html;
      }
    } catch (err) {
      alert('Lỗi: ' + err.message);
    }
  };

  window.saveAiApiKeyAction = function () {
    const key = document.getElementById('ai-custom-api-key')?.value?.trim();
    if (!window.state) window.state = {};
    if (!window.state.settings) window.state.settings = {};
    window.state.settings.geminiApiKey = key;
    if (typeof window.saveLocalState === 'function') window.saveLocalState();
    const st = document.getElementById('ai-key-status');
    if (st) {
      st.className = 'mt-3 text-xs font-bold text-emerald-600';
      st.textContent = '✓ Đã lưu API Key an toàn trong cài đặt lớp học!';
    }
  };

  window.testAiConnectionAction = async function () {
    const key = document.getElementById('ai-custom-api-key')?.value?.trim();
    const st = document.getElementById('ai-key-status');
    if (st) {
      st.className = 'mt-3 text-xs font-bold text-slate-600';
      st.textContent = 'Đang kiểm tra kết nối API...';
    }
    try {
      const res = await fetch('/api/ai/zalo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student: { name: 'Nguyễn Văn A', points: 10 },
          type: 'general',
          apiKey: key
        })
      });
      const data = await res.json();
      if (data && data.success) {
        if (st) {
          st.className = 'mt-3 text-xs font-bold text-emerald-600';
          st.textContent = `✓ Kết nối thành công tới Gemini AI (${data.model})!`;
        }
      } else {
        if (st) {
          st.className = 'mt-3 text-xs font-bold text-red-600';
          st.textContent = '✗ Lỗi kết nối: ' + (data.error || 'Key không hợp lệ');
        }
      }
    } catch (e) {
      if (st) {
        st.className = 'mt-3 text-xs font-bold text-red-600';
        st.textContent = '✗ Lỗi mạng: ' + e.message;
      }
    }
  };

  // ==========================================
  // PHASE 1: NHẬP & XUẤT EXCEL VNEDU & SMAS
  // ==========================================
  window.openVnEduModal = function () {
    const host = getModalContainer();
    host.innerHTML = `
      <div class="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn">
        <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-5 text-slate-800">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <h3 class="text-base font-black text-slate-900 flex items-center gap-2">
              <i class="ph-fill ph-file-xls text-emerald-600 text-xl"></i> Đồng bộ VnEdu & SMAS (Viettel)
            </h3>
            <button onclick="closeExpansionModal()" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500">
              <i class="ph-bold ph-x"></i>
            </button>
          </div>

          <div class="space-y-4 text-xs">
            <div class="bg-emerald-50 border border-emerald-200 p-3.5 rounded-xl">
              <div class="font-bold text-emerald-900 mb-1 flex items-center gap-1.5">
                <i class="ph-bold ph-upload-simple"></i> 1. Nhập danh sách từ VnEdu / SMAS
              </div>
              <p class="text-emerald-800 leading-relaxed mb-3">
                Chọn file Excel (.xlsx) xuất từ cổng thông tin VnEdu hoặc SMAS. Hệ thống tự động nhận diện STT, Mã định danh, Họ tên, Ngày sinh, Giới tính, Tổ...
              </p>
              <input type="file" id="vnedu-excel-file" accept=".xlsx, .xls" class="block w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-emerald-600 file:text-white hover:file:bg-emerald-700 cursor-pointer" />
              <button onclick="processVnEduImport()" class="mt-2.5 w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm">
                Xác nhận Nhập dữ liệu
              </button>
            </div>

            <div class="bg-slate-50 border border-slate-200 p-3.5 rounded-xl">
              <div class="font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                <i class="ph-bold ph-download-simple"></i> 2. Xuất dữ liệu chuẩn VnEdu & SMAS
              </div>
              <p class="text-slate-600 leading-relaxed mb-3">
                Xuất file Excel có định dạng cột chuẩn để dễ dàng đối chiếu hoặc nộp lên hệ thống quản lý trường học.
              </p>
              <div class="grid grid-cols-2 gap-2">
                <button onclick="exportStandardExcel('vnedu')" class="py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm flex items-center justify-center gap-1.5">
                  <i class="ph-bold ph-microsoft-excel-logo"></i> Mẫu VnEdu
                </button>
                <button onclick="exportStandardExcel('smas')" class="py-2 px-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow-sm flex items-center justify-center gap-1.5">
                  <i class="ph-bold ph-microsoft-excel-logo"></i> Mẫu SMAS
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  };

  window.processVnEduImport = function () {
    const input = document.getElementById('vnedu-excel-file');
    if (!input || !input.files || input.files.length === 0) {
      alert('Vui lòng chọn file Excel trước.');
      return;
    }
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

        if (!rows || rows.length < 2) {
          alert('File Excel trống hoặc không có dòng dữ liệu.');
          return;
        }

        // Detect header row
        let headerRowIdx = -1;
        let colMap = {};
        for (let r = 0; r < Math.min(10, rows.length); r++) {
          const row = rows[r];
          if (!Array.isArray(row)) continue;
          row.forEach((cell, cIdx) => {
            const str = String(cell || '').trim().toLowerCase();
            if (str.includes('họ và tên') || str.includes('họ tên') || str.includes('tên học sinh')) colMap.name = cIdx;
            if (str.includes('mã hs') || str.includes('mã học sinh') || str.includes('mã định danh')) colMap.code = cIdx;
            if (str.includes('giới tính')) colMap.gender = cIdx;
            if (str.includes('ngày sinh')) colMap.dob = cIdx;
            if (str.includes('tổ') || str.includes('nhóm')) colMap.group = cIdx;
            if (str.includes('chức vụ')) colMap.role = cIdx;
          });
          if (colMap.name !== undefined) {
            headerRowIdx = r;
            break;
          }
        }

        if (headerRowIdx === -1 || colMap.name === undefined) {
          alert('Không tìm thấy cột "Họ và tên" trong file Excel. Vui lòng kiểm tra lại cấu trúc file.');
          return;
        }

        const newStudents = [];
        let nextId = (window.state && Array.isArray(window.state.students) && window.state.students.length > 0)
          ? Math.max(...window.state.students.map(s => Number(s.id) || 0)) + 1
          : 1;

        for (let r = headerRowIdx + 1; r < rows.length; r++) {
          const row = rows[r];
          if (!row || !row[colMap.name]) continue;
          const name = String(row[colMap.name]).trim();
          if (!name) continue;

          const code = colMap.code !== undefined && row[colMap.code] ? String(row[colMap.code]).trim() : `HS${String(nextId).padStart(2, '0')}`;
          const gender = colMap.gender !== undefined && String(row[colMap.gender]).toLowerCase().includes('nữ') ? 'Nữ' : 'Nam';
          const group = colMap.group !== undefined && row[colMap.group] ? String(row[colMap.group]).trim() : 'Tổ 1';
          const role = colMap.role !== undefined && row[colMap.role] ? String(row[colMap.role]).trim() : 'Học sinh';

          newStudents.push({
            id: nextId++,
            name,
            code,
            gender,
            group,
            role,
            points: 0,
            history: []
          });
        }

        if (newStudents.length === 0) {
          alert('Không tìm thấy bản ghi học sinh nào hợp lệ.');
          return;
        }

        if (confirm(`Đã tìm thấy ${newStudents.length} học sinh từ file Excel. Bạn có muốn THAY THẾ (Bấm OK) hay THÊM NỐI TIẾP (Bấm Cancel)?`)) {
          window.state.students = newStudents;
        } else {
          window.state.students = [...(window.state.students || []), ...newStudents];
        }

        if (typeof window.saveLocalState === 'function') window.saveLocalState();
        if (typeof window.syncStateToCloud === 'function') window.syncStateToCloud();
        if (typeof window.renderLayout === 'function') window.renderLayout();

        closeExpansionModal();
        alert(`Thành công! Đã nhập ${newStudents.length} học sinh vào hệ thống.`);
      } catch (err) {
        alert('Lỗi đọc file Excel: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  window.exportStandardExcel = function (format = 'vnedu') {
    const students = getActiveStudents();
    const classInfo = getClassInfo();
    const rows = [
      [`DANH SÁCH HỌC SINH & THEO DÕI NỀ NẾP (${format.toUpperCase()})`],
      [`Lớp: ${classInfo.className} | GVCN: ${classInfo.teacherName} | Trường: ${classInfo.schoolName}`],
      ['STT', 'Mã Học Sinh', 'Họ và Tên', 'Giới Tính', 'Tổ / Nhóm', 'Chức Vụ', 'Điểm Thi Đua', 'Lời Nhận Xét GVCN']
    ];

    students.forEach((s, idx) => {
      rows.push([
        idx + 1,
        s.code || `HS${String(s.id).padStart(2, '0')}`,
        s.name,
        s.gender || 'Nam',
        s.group || '',
        s.role || 'Học sinh',
        s.points || 0,
        s.comment || ''
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DanhSachHocSinh');
    XLSX.writeFile(wb, `${classInfo.className}_DanhSach_${format.toUpperCase()}.xlsx`);
  };

  // ==========================================
  // PHASE 2: SƠ ĐỒ LỚP HỌC KÉO - THẢ & LUÂN CHUYỂN
  // ==========================================
  window.openSeatingModal = function () {
    const host = getModalContainer();
    const students = getActiveStudents();
    const classInfo = getClassInfo();

    // Init seating plan: 4 Rows x 4 Columns of double desks = 32 seats or 5 rows = 40 seats
    const totalDesks = 16; // 4 rows x 4 columns = 16 double desks = 32 seats (can expand)
    if (!window.state.seatingPlanGrid || !Array.isArray(window.state.seatingPlanGrid)) {
      window.state.seatingPlanGrid = [];
      for (let i = 0; i < 40; i++) {
        window.state.seatingPlanGrid.push(students[i] ? students[i].id : null);
      }
    }

    host.innerHTML = `
      <div class="fixed inset-0 z-[1000] flex items-center justify-center p-2 sm:p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
        <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden text-slate-800">
          
          <!-- Header -->
          <div class="p-4 bg-gradient-to-r from-teal-700 to-emerald-800 text-white flex items-center justify-between flex-shrink-0">
            <div>
              <h3 class="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
                <i class="ph-bold ph-chalkboard-simple text-xl text-amber-300"></i> Sơ Đồ Chỗ Ngồi Lớp Học
                <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/20">${classInfo.className}</span>
              </h3>
              <p class="text-xs text-emerald-100/90">Kéo thả hoặc click chọn 2 vị trí để đổi chỗ • Luân chuyển định kỳ 2 tuần/lần</p>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="rotateSeatingPlan('columns')" class="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold text-xs rounded-lg shadow-sm flex items-center gap-1" title="Xoay vòng Dãy 1 -> 2 -> 3 -> 4">
                <i class="ph-bold ph-arrows-clockwise"></i> Luân chuyển 2 tuần/lần
              </button>
              <button onclick="window.print()" class="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white font-bold text-xs rounded-lg transition flex items-center gap-1">
                <i class="ph-bold ph-printer"></i> In Sơ đồ (A4)
              </button>
              <button onclick="closeExpansionModal()" class="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition">
                <i class="ph-bold ph-x"></i>
              </button>
            </div>
          </div>

          <!-- Classroom Canvas -->
          <div class="p-4 sm:p-6 overflow-y-auto custom-scrollbar flex-1 bg-slate-100/80">
            <!-- Bục giảng & Bảng đen -->
            <div class="max-w-2xl mx-auto mb-6">
              <div class="bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 text-white text-center py-2.5 rounded-xl shadow-md border-2 border-slate-700 relative">
                <span class="text-xs font-black tracking-widest uppercase text-emerald-400">BẢNG LỚP HỌC & BỤC GIẢNG</span>
                <div class="absolute left-4 top-2 text-[10px] font-bold text-slate-400">🚪 Cửa ra vào</div>
                <div class="absolute right-4 top-2 text-[10px] font-bold text-amber-300">🧑‍🏫 Bàn Giáo viên</div>
              </div>
            </div>

            <!-- Desk Matrix: 4 Dãy (Columns) -->
            <div id="seating-grid-container" class="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 max-w-4xl mx-auto">
              <!-- Rendered via JS -->
            </div>
          </div>

          <!-- Footer Status -->
          <div class="p-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-600 flex items-center justify-between flex-shrink-0">
            <div class="flex items-center gap-4">
              <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded bg-emerald-500"></span> Đã có chỗ</span>
              <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded bg-slate-300"></span> Bàn trống</span>
              <span class="text-slate-500 italic">Mẹo: Click vào 1 bạn, sau đó click vào bạn thứ 2 để đổi chỗ ngay lập tức!</span>
            </div>
            <button onclick="saveSeatingPlanState()" class="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm">
              Lưu sơ đồ chỗ ngồi
            </button>
          </div>

        </div>
      </div>
    `;

    renderSeatingGrid();
  };

  let selectedSeatIndex = null;

  function renderSeatingGrid() {
    const container = document.getElementById('seating-grid-container');
    if (!container) return;
    const students = getActiveStudents();
    const studentMap = new Map(students.map(s => [s.id, s]));
    const grid = window.state.seatingPlanGrid || [];

    // 4 Dãy (Dãy 1, Dãy 2, Dãy 3, Dãy 4)
    // Mỗi dãy có 5 bàn đôi = 10 chỗ (Total 40 seats)
    let columnsHtml = ['', '', '', ''];

    for (let c = 0; c < 4; c++) {
      columnsHtml[c] += `<div class="space-y-3"><div class="text-center font-black text-xs text-slate-500 uppercase pb-1 border-b border-slate-200">DÃY ${c + 1}</div>`;
      for (let r = 0; r < 5; r++) {
        const seatIdx1 = (c * 10) + (r * 2);
        const seatIdx2 = (c * 10) + (r * 2) + 1;
        const s1 = studentMap.get(grid[seatIdx1]);
        const s2 = studentMap.get(grid[seatIdx2]);

        columnsHtml[c] += `
          <div class="bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
            <div class="text-[9px] font-bold text-slate-400 mb-1 flex justify-between">
              <span>Bàn ${r + 1}</span>
              ${r === 0 ? '<span class="text-amber-600">Bàn đầu 👓</span>' : ''}
            </div>
            <div class="grid grid-cols-2 gap-1.5">
              ${renderSeatCard(seatIdx1, s1)}
              ${renderSeatCard(seatIdx2, s2)}
            </div>
          </div>
        `;
      }
      columnsHtml[c] += `</div>`;
    }

    container.innerHTML = columnsHtml.join('');
  }

  function renderSeatCard(seatIdx, student) {
    const isSelected = selectedSeatIndex === seatIdx;
    if (!student) {
      return `
        <div onclick="selectSeatIndex(${seatIdx})" class="border-2 border-dashed ${isSelected ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-slate-50'} rounded-lg p-2 text-center cursor-pointer hover:border-emerald-400 transition min-h-[50px] flex items-center justify-center">
          <span class="text-[10px] text-slate-400 font-medium">+ Trống</span>
        </div>
      `;
    }
    return `
      <div onclick="selectSeatIndex(${seatIdx})" class="border ${isSelected ? 'border-amber-500 ring-2 ring-amber-400 bg-amber-50' : 'border-emerald-200 bg-emerald-50/50'} rounded-lg p-2 cursor-pointer hover:shadow-md transition min-h-[50px] flex flex-col justify-between">
        <div class="font-bold text-[11px] text-slate-900 truncate" title="${escapeHtml(student.name)}">
          ${escapeHtml(student.name)}
        </div>
        <div class="flex items-center justify-between text-[9px] text-slate-500 mt-1">
          <span class="font-semibold text-emerald-700">${escapeHtml(student.group || 'Tổ')}</span>
          <span class="font-bold text-slate-400">${student.points || 0}đ</span>
        </div>
      </div>
    `;
  }

  window.selectSeatIndex = function (idx) {
    if (selectedSeatIndex === null) {
      selectedSeatIndex = idx;
      renderSeatingGrid();
    } else if (selectedSeatIndex === idx) {
      selectedSeatIndex = null;
      renderSeatingGrid();
    } else {
      // Swap seats!
      const grid = window.state.seatingPlanGrid;
      const temp = grid[selectedSeatIndex];
      grid[selectedSeatIndex] = grid[idx];
      grid[idx] = temp;
      selectedSeatIndex = null;
      renderSeatingGrid();
    }
  };

  window.rotateSeatingPlan = function (mode = 'columns') {
    if (!window.state.seatingPlanGrid) return;
    const grid = window.state.seatingPlanGrid;

    if (confirm('Bạn có muốn tự động luân chuyển chỗ ngồi định kỳ? Dãy 1 -> Dãy 2 -> Dãy 3 -> Dãy 4 -> Dãy 1.')) {
      // Rotate 4 columns: column 0 -> 1, 1 -> 2, 2 -> 3, 3 -> 0
      const col0 = grid.slice(0, 10);
      const col1 = grid.slice(10, 20);
      const col2 = grid.slice(20, 30);
      const col3 = grid.slice(30, 40);

      window.state.seatingPlanGrid = [...col3, ...col0, ...col1, ...col2];
      renderSeatingGrid();
      alert('Đã luân chuyển toàn bộ 4 dãy bàn thành công!');
    }
  };

  window.saveSeatingPlanState = function () {
    if (typeof window.saveLocalState === 'function') window.saveLocalState();
    if (typeof window.syncStateToCloud === 'function') window.syncStateToCloud();
    alert('Đã lưu sơ đồ chỗ ngồi thành công!');
    closeExpansionModal();
  };

  // ==========================================
  // PHASE 2: BIÊN BẢN SINH HOẠT LỚP XUẤT WORD
  // ==========================================
  window.openMeetingMinutesModal = function () {
    const host = getModalContainer();
    const students = getActiveStudents();
    const classInfo = getClassInfo();
    const today = new Date().toLocaleDateString('vi-VN');

    // Aggregate statistics
    const totalStudents = students.length;
    const sorted = [...students].sort((a, b) => (b.points || 0) - (a.points || 0));
    const topStudents = sorted.slice(0, 3);
    const bottomStudents = sorted.filter(s => (s.points || 0) < 0);

    host.innerHTML = `
      <div class="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn">
        <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800">
          
          <div class="p-4 bg-gradient-to-r from-blue-700 to-indigo-800 text-white flex items-center justify-between flex-shrink-0">
            <div>
              <h3 class="text-base font-black tracking-tight flex items-center gap-2">
                <i class="ph-bold ph-file-text text-xl text-amber-300"></i> Biên Bản Tiết Sinh Hoạt Lớp
              </h3>
              <p class="text-xs text-blue-100">Mẫu biên bản chuẩn Bộ GD&ĐT • Xuất file Microsoft Word (.doc) & In ấn A4</p>
            </div>
            <div class="flex gap-2">
              <button onclick="exportWordMinutes()" class="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5">
                <i class="ph-bold ph-download-simple"></i> Tải file Word (.doc)
              </button>
              <button onclick="window.print()" class="px-3.5 py-1.5 bg-white/20 hover:bg-white/30 text-white font-bold text-xs rounded-lg flex items-center gap-1.5">
                <i class="ph-bold ph-printer"></i> In A4
              </button>
              <button onclick="closeExpansionModal()" class="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center">
                <i class="ph-bold ph-x"></i>
              </button>
            </div>
          </div>

          <div class="p-6 overflow-y-auto custom-scrollbar flex-1 bg-white font-serif leading-relaxed text-sm text-slate-800">
            <div id="print-minutes-area" class="max-w-2xl mx-auto space-y-4">
              
              <!-- Quốc hiệu -->
              <div class="text-center mb-6">
                <div class="font-bold text-xs tracking-wider uppercase">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
                <div class="font-bold text-xs border-b border-slate-400 inline-block pb-1">Độc lập - Tự do - Hạnh phúc</div>
                <div class="text-[11px] italic mt-2 text-slate-500">..., ngày ${today}</div>
              </div>

              <!-- Tiêu đề -->
              <div class="text-center font-bold text-base uppercase text-slate-900 mb-6">
                BIÊN BẢN TIẾT SINH HOẠT LỚP
                <div class="text-xs font-normal capitalize">Tuần học: Tuần hiện tại — Năm học 2026 - 2027</div>
              </div>

              <!-- I. THÔNG TIN CHUNG -->
              <div>
                <div class="font-bold text-xs uppercase mb-1">I. THỜI GIAN & THÀNH PHẦN:</div>
                <ul class="list-disc pl-5 text-xs space-y-1 text-slate-700">
                  <li><strong>Thời gian:</strong> Tiết Sinh hoạt cuối tuần, ngày ${today}.</li>
                  <li><strong>Địa điểm:</strong> Phòng học lớp ${escapeHtml(classInfo.className)}, ${escapeHtml(classInfo.schoolName)}.</li>
                  <li><strong>Chủ tọa:</strong> Thầy/Cô ${escapeHtml(classInfo.teacherName)} (Giáo viên chủ nhiệm).</li>
                  <li><strong>Thư ký:</strong> Ban cán sự lớp.</li>
                  <li><strong>Sĩ số:</strong> Tổng số ${totalStudents} học sinh (Có mặt đầy đủ).</li>
                </ul>
              </div>

              <!-- II. NỘI DUNG -->
              <div>
                <div class="font-bold text-xs uppercase mb-1">II. NỘI DUNG TIẾT SINH HOẠT:</div>
                
                <p class="text-xs font-bold text-slate-800 mt-2">1. Báo cáo đánh giá tuần qua của Ban cán sự lớp:</p>
                <p class="text-xs text-slate-700 pl-3">
                  - <strong>Về học tập:</strong> Đa số học sinh đi học đúng giờ, chuẩn bị bài đầy đủ. Các giờ học diễn ra nghiêm túc, sôi nổi.<br>
                  - <strong>Về nề nếp & kỷ luật:</strong> Thực hiện tốt nội quy đồng phục, xếp hàng đầu giờ và bảo vệ tài sản chung.<br>
                  - <strong>Về vệ sinh & trực nhật:</strong> Các tổ hoàn thành tốt nhiệm vụ trực nhật, lớp học sạch sẽ thoáng mát.
                </p>

                <p class="text-xs font-bold text-slate-800 mt-2">2. Kết quả thi đua & Tuyên dương:</p>
                <div class="pl-3 text-xs text-slate-700">
                  - <strong>Học sinh tiêu biểu xuất sắc trong tuần:</strong>
                  <ul class="list-disc pl-5 mt-1 font-semibold text-emerald-800">
                    ${topStudents.map(s => `<li>${escapeHtml(s.name)} (${s.points || 0} điểm thi đua)</li>`).join('')}
                  </ul>
                  ${bottomStudents.length > 0 ? `
                    <div class="mt-2 text-amber-900">
                      - <strong>Học sinh cần rút kinh nghiệm về nề nếp:</strong> ${bottomStudents.map(s => escapeHtml(s.name)).join(', ')}. GVCN đã nhắc nhở và hướng dẫn khắc phục trên tinh thần giáo dục tích cực.
                    </div>
                  ` : '<div class="mt-1 text-emerald-700 font-medium">- Không có học sinh vi phạm kỷ luật nghiêm trọng.</div>'}
                </div>

                <p class="text-xs font-bold text-slate-800 mt-3">3. Ý kiến phát biểu của Giáo viên chủ nhiệm:</p>
                <p class="text-xs text-slate-700 pl-3 italic">
                  Biểu dương tinh thần đoàn kết, nỗ lực học tập của tập thể lớp. Đề nghị Ban cán sự tiếp tục duy trì đôn đốc nề nếp; các bạn học sinh còn hạn chế chủ động trao đổi với thầy cô và bạn bè để cùng tiến bộ.
                </p>

                <p class="text-xs font-bold text-slate-800 mt-3">4. Phương hướng, nhiệm vụ tuần tiếp theo:</p>
                <ul class="list-disc pl-8 text-xs text-slate-700 space-y-1">
                  <li>Tiếp tục duy trì chuyên cần, đi học đúng giờ 100%.</li>
                  <li>Tập trung ôn tập chuẩn bị cho các bài kiểm tra định kỳ.</li>
                  <li>Tích cực tham gia các phong trào thi đua và hoạt động trải nghiệm của nhà trường.</li>
                </ul>
              </div>

              <!-- Ký tên -->
              <div class="grid grid-cols-2 text-center pt-8 text-xs font-bold">
                <div>
                  THƯ KÝ LỚP<br><br><br>
                  <span class="font-normal italic">(Đã ký)</span>
                </div>
                <div>
                  GIÁO VIÊN CHỦ NHIỆM<br><br><br>
                  <span class="text-emerald-800">${escapeHtml(classInfo.teacherName)}</span>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    `;
  };

  window.exportWordMinutes = function () {
    const content = document.getElementById('print-minutes-area')?.innerHTML;
    if (!content) return;
    const classInfo = getClassInfo();
    exportWordFromHtml(`Bien_Ban_Sinh_Hoat_${classInfo.className}`, content);
  };

  function exportWordFromHtml(filename, htmlContent) {
    const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head><meta charset='utf-8'><title>Biên bản</title>
    <style>
      body { font-family: 'Times New Roman', serif; font-size: 13pt; line-height: 1.3; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th, td { border: 1px solid #333; padding: 6px; }
      .text-center { text-align: center; }
      .font-bold { font-weight: bold; }
    </style></head><body>`;
    const footer = `</body></html>`;
    const sourceHTML = header + htmlContent + footer;

    const blob = new Blob(['\ufeff', sourceHTML], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  window.exportWordFromText = function (filename, textContent) {
    const formatted = textContent.replace(/\n/g, '<br/>');
    exportWordFromHtml(filename, `<div style="white-space: pre-wrap;">${formatted}</div>`);
  };

  // ==========================================
  // PHASE 3: CHẾ ĐỘ TRÌNH CHIẾU SMART TV / MÁY CHIẾU (THEATER MODE)
  // ==========================================
  window.openTheaterModal = function () {
    const host = getModalContainer();
    const students = getActiveStudents();
    const classInfo = getClassInfo();
    const sorted = [...students].sort((a, b) => (b.points || 0) - (a.points || 0));
    const topStars = sorted.slice(0, 5);

    host.innerHTML = `
      <div id="theater-fullscreen-container" class="fixed inset-0 z-[2000] bg-slate-950 text-white flex flex-col justify-between p-6 sm:p-10 overflow-hidden animate-fadeIn">
        
        <!-- Top Toolbar -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="text-3xl">✨</span>
            <div>
              <h2 class="text-xl sm:text-2xl font-black tracking-tight text-amber-300 uppercase">
                BẢNG VINH DANH NGÔI SAO LỚP HỌC
              </h2>
              <p class="text-xs text-slate-400 font-semibold tracking-wider">
                ${classInfo.className} • ${classInfo.schoolName}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <button onclick="toggleTheaterFullscreen()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold text-xs flex items-center gap-2 border border-slate-700">
              <i class="ph-bold ph-arrows-out"></i> Toàn màn hình (F11)
            </button>
            <button onclick="closeExpansionModal()" class="w-10 h-10 rounded-xl bg-red-600/80 hover:bg-red-600 text-white flex items-center justify-center font-bold text-lg">
              ✕
            </button>
          </div>
        </div>

        <!-- Center Stage: Top 5 Champions -->
        <div class="grid grid-cols-1 sm:grid-cols-5 gap-4 sm:gap-6 my-auto max-w-6xl mx-auto w-full items-end">
          
          <!-- Hạng 2 -->
          <div class="bg-gradient-to-b from-slate-800/80 to-slate-900/90 border-2 border-slate-500 rounded-2xl p-5 text-center shadow-xl order-2 sm:order-1 transform hover:scale-105 transition">
            <div class="text-3xl mb-1">🥈</div>
            <div class="text-xs font-bold text-slate-400 uppercase tracking-widest">HẠNG NHÌ</div>
            <div class="text-base font-black text-slate-100 my-2 truncate">${topStars[1] ? escapeHtml(topStars[1].name) : '---'}</div>
            <div class="text-xl font-black text-amber-400">${topStars[1] ? topStars[1].points : 0} ⭐</div>
          </div>

          <!-- Hạng 1 (Quán Quân) -->
          <div class="bg-gradient-to-b from-amber-600/30 via-slate-900 to-slate-900 border-4 border-amber-400 rounded-3xl p-6 text-center shadow-2xl order-1 sm:order-2 transform hover:scale-110 transition -translate-y-4">
            <div class="text-5xl mb-2 animate-bounce">👑</div>
            <div class="text-xs font-black text-amber-300 uppercase tracking-widest">NGÔI SAO TUẦN</div>
            <div class="text-xl font-black text-white my-2 truncate">${topStars[0] ? escapeHtml(topStars[0].name) : '---'}</div>
            <div class="text-3xl font-black text-amber-300 drop-shadow">${topStars[0] ? topStars[0].points : 0} ⭐</div>
            <div class="mt-3 inline-block px-3 py-1 rounded-full text-[11px] font-bold bg-amber-400/20 text-amber-200 border border-amber-400/40">
              Xuất Sắc Nhất
            </div>
          </div>

          <!-- Hạng 3 -->
          <div class="bg-gradient-to-b from-slate-800/80 to-slate-900/90 border-2 border-amber-700/60 rounded-2xl p-5 text-center shadow-xl order-3 transform hover:scale-105 transition">
            <div class="text-3xl mb-1">🥉</div>
            <div class="text-xs font-bold text-amber-600 uppercase tracking-widest">HẠNG BA</div>
            <div class="text-base font-black text-slate-100 my-2 truncate">${topStars[2] ? escapeHtml(topStars[2].name) : '---'}</div>
            <div class="text-xl font-black text-amber-400">${topStars[2] ? topStars[2].points : 0} ⭐</div>
          </div>

          <!-- Hạng 4 -->
          <div class="bg-slate-900/60 border border-slate-700 rounded-2xl p-4 text-center order-4 hidden sm:block">
            <div class="text-2xl mb-1">🌟</div>
            <div class="text-[10px] font-bold text-slate-400 uppercase">HẠNG 4</div>
            <div class="text-sm font-bold text-slate-200 my-1 truncate">${topStars[3] ? escapeHtml(topStars[3].name) : '---'}</div>
            <div class="text-sm font-black text-amber-400">${topStars[3] ? topStars[3].points : 0} ⭐</div>
          </div>

          <!-- Hạng 5 -->
          <div class="bg-slate-900/60 border border-slate-700 rounded-2xl p-4 text-center order-5 hidden sm:block">
            <div class="text-2xl mb-1">🌟</div>
            <div class="text-[10px] font-bold text-slate-400 uppercase">HẠNG 5</div>
            <div class="text-sm font-bold text-slate-200 my-1 truncate">${topStars[4] ? escapeHtml(topStars[4].name) : '---'}</div>
            <div class="text-sm font-black text-amber-400">${topStars[4] ? topStars[4].points : 0} ⭐</div>
          </div>

        </div>

        <!-- Footer Control -->
        <div class="flex items-center justify-between text-xs text-slate-400 pt-4 border-t border-slate-800">
          <span>✨ Chúc mừng tất cả các bạn đã nỗ lực hết mình trong tuần qua!</span>
          <div class="flex gap-2">
            <button onclick="closeExpansionModal(); switchTab('vong-quay');" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-1.5 shadow-md">
              <i class="ph-bold ph-cards"></i> Mở Vòng Quay May Mắn
            </button>
            <button onclick="closeExpansionModal(); switchTab('dong-ho');" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center gap-1.5 shadow-md">
              <i class="ph-bold ph-timer"></i> Mở Đồng Hồ Đếm Ngược
            </button>
          </div>
        </div>

      </div>
    `;
  };

  window.toggleTheaterFullscreen = function () {
    const el = document.getElementById('theater-fullscreen-container');
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // ==========================================
  // PHASE 3: THẺ IN MÃ QR TRA CỨU PHỤ HUYNH
  // ==========================================
  window.openQrCardsModal = function () {
    const host = getModalContainer();
    const students = getActiveStudents();
    const classInfo = getClassInfo();
    const baseUrl = window.location.origin + window.location.pathname;

    host.innerHTML = `
      <div class="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn">
        <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800">
          
          <div class="p-4 bg-gradient-to-r from-emerald-700 to-teal-800 text-white flex items-center justify-between flex-shrink-0">
            <div>
              <h3 class="text-base font-black tracking-tight flex items-center gap-2">
                <i class="ph-bold ph-qr-code text-xl text-amber-300"></i> Phiếu Tra Cứu Mã QR Dành Cho Phụ Huynh
              </h3>
              <p class="text-xs text-emerald-100">In khổ A4 cắt dán vào sổ liên lạc / nhãn vở • Phụ huynh quét bằng Zalo xem ngay kết quả</p>
            </div>
            <div class="flex gap-2">
              <button onclick="window.print()" class="px-4 py-1.5 bg-amber-400 hover:bg-amber-500 text-slate-900 font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5">
                <i class="ph-bold ph-printer"></i> In Phiếu Toàn Lớp (A4)
              </button>
              <button onclick="closeExpansionModal()" class="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center">
                <i class="ph-bold ph-x"></i>
              </button>
            </div>
          </div>

          <div class="p-4 sm:p-6 overflow-y-auto custom-scrollbar flex-1 bg-slate-50">
            <div id="print-qr-cards-area" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              ${students.map((s, idx) => {
                const code = s.code || `HS${String(s.id).padStart(2, '0')}`;
                const lookupUrl = `${baseUrl}?lookup=1&code=${encodeURIComponent(code)}`;
                const qrSvg = typeof window.generateQRCodeSvg === 'function' ? window.generateQRCodeSvg(lookupUrl, 100) : '<div class="w-20 h-20 bg-slate-200"></div>';
                return `
                  <div class="bg-white border-2 border-dashed border-slate-300 p-3 rounded-xl flex items-center gap-3 shadow-sm break-inside-avoid">
                    <div class="flex-shrink-0 w-24 h-24 flex items-center justify-center bg-white p-1 border border-slate-100 rounded-lg">
                      ${qrSvg}
                    </div>
                    <div class="flex-1 min-w-0 text-left">
                      <div class="text-[9px] font-black uppercase text-emerald-700 tracking-wider">${escapeHtml(classInfo.schoolName)}</div>
                      <div class="text-xs font-black text-slate-900 truncate my-0.5">${escapeHtml(s.name)}</div>
                      <div class="text-[10px] text-slate-500 font-medium">Lớp: <strong class="text-slate-800">${escapeHtml(classInfo.className)}</strong></div>
                      <div class="text-[10px] text-slate-500 font-mono mt-1">Mã: <strong class="text-emerald-700">${escapeHtml(code)}</strong></div>
                      <div class="text-[8px] text-slate-400 italic mt-1">Quét bằng Zalo hoặc Camera</div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

        </div>
      </div>
    `;
  };

  console.log('[GVCN PRO Expansion] Đã khởi tạo thành công toàn diện 3 giai đoạn nâng cấp!');
})();
