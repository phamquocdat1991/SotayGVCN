import { GoogleGenAI } from '@google/genai';

const MODELS_CASCADE = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-2.5-flash'];

export function getActiveApiKey(clientKey) {
  return (clientKey && typeof clientKey === 'string' && clientKey.trim()) ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    null;
}

async function callGeminiWithCascade(prompt, systemInstruction, apiKey) {
  let lastError = null;
  const key = getActiveApiKey(apiKey);
  if (!key) {
    throw new Error('MISSING_API_KEY');
  }

  const ai = new GoogleGenAI({ apiKey: key });

  for (const model of MODELS_CASCADE) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: systemInstruction || 'Bạn là Chuyên gia Giáo dục & Cố vấn Sư phạm cao cấp dành cho Giáo viên chủ nhiệm tại Việt Nam. Ngôn ngữ xưng hô trang trọng, chuẩn mực: Thầy/Cô, Học sinh. Tuân thủ nghiêm ngặt các quy định của Bộ GD&ĐT (Thông tư 22/2021, Thông tư 27/2020).'
        }
      });
      if (response && response.text) {
        return { text: response.text, model };
      }
    } catch (err) {
      lastError = err;
      console.warn(`[GVCN AI] Model ${model} failed, trying next...:`, err.message);
    }
  }

  throw lastError || new Error('All Gemini cascade models failed');
}

// 1. GENERATE STUDENT COMMENTS (HỌC BẠ / ĐÁNH GIÁ THÁNG)
export async function generateStudentComments({ students, criteria = 'tt22', month = 'Tháng này', apiKey }) {
  const activeKey = getActiveApiKey(apiKey);

  if (activeKey) {
    try {
      const prompt = `Hãy viết nhận xét học bạ / sổ theo dõi cho các học sinh sau theo chuẩn ${criteria === 'tt22' ? 'Thông tư 22/2021/TT-BGDĐT (THCS/THPT)' : 'Thông tư 27/2020/TT-BGDĐT (Tiểu học)'}.
Thời điểm: ${month}.

Dữ liệu học sinh:
${JSON.stringify(students.map(s => ({
  id: s.id,
  name: s.name,
  gender: s.gender || 'Nam',
  points: s.points || 0,
  attendanceScore: s.attendanceRate || '100%',
  strengths: s.strengths || '',
  concerns: s.concerns || '',
  role: s.role || 'Học sinh'
})), null, 2)}

Yêu cầu định dạng:
Trả về DUY NHẤT một mảng JSON thuần túy (không bọc trong markdown code fence), mỗi phần tử gồm:
[
  {
    "id": <id học sinh>,
    "name": "<tên học sinh>",
    "phamChat": "<Nhận xét về 5 phẩm chất: Yêu nước, Nhân ái, Chăm chỉ, Trung thực, Trách nhiệm>",
    "nangLuc": "<Nhận xét về năng lực tự chủ, hợp tác, học tập>",
    "nhanXetChung": "<Lời nhận xét sư phạm tổng quan, mang tính động viên, xây dựng>",
    "xepLoaiGoiY": "<Tốt/Khá/Đạt/Chưa đạt hoặc Hoàn thành tốt/Hoàn thành>"
  }
]`;

      const res = await callGeminiWithCascade(prompt, 'Bạn là Chuyên gia Đánh giá Học sinh theo chuẩn Thông tư Bộ GD&ĐT Việt Nam. Hãy trả về JSON hợp lệ.', activeKey);
      let cleaned = res.text.trim();
      if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
      if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
      if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
      const parsed = JSON.parse(cleaned.trim());
      return { success: true, model: res.model, comments: parsed };
    } catch (err) {
      console.warn('[GVCN AI] Gemini comment generation error, falling back to rule-based engine:', err.message);
    }
  }

  // Pedagogical Rule-Based Fallback Engine (Đảm bảo luôn luôn có kết quả ngay cả khi không có mạng/key)
  const comments = students.map(s => {
    const pts = Number(s.points || 0);
    const gender = s.gender === 'Nữ' ? 'Em' : 'Em';
    let phamChat = '';
    let nangLuc = '';
    let nhanXetChung = '';
    let xepLoaiGoiY = 'Đạt';

    if (pts >= 30) {
      phamChat = `${gender} luôn gương mẫu, có ý thức kỷ luật tốt, lễ phép với thầy cô và hòa nhã với bạn bè. Tinh thần trách nhiệm cao trong các hoạt động lớp.`;
      nangLuc = 'Chủ động, tích cực trong học tập; có tư duy tự học tốt và khả năng hợp tác nhóm hiệu quả.';
      nhanXetChung = `${gender} ${s.name} đạt kết quả rèn luyện xuất sắc trong tháng. Cần tiếp tục phát huy năng lực để đạt thành tích cao hơn nữa.`;
      xepLoaiGoiY = criteria === 'tt22' ? 'Tốt' : 'Hoàn thành tốt';
    } else if (pts >= 10) {
      phamChat = `${gender} chấp hành tốt nội quy nhà trường, chăm chỉ, trung thực và có tinh thần đoàn kết.`;
      nangLuc = 'Có ý thức tự giác làm bài và tham gia tích cực các hoạt động học tập trên lớp.';
      nhanXetChung = `${gender} rèn luyện tốt, chuyên cần ổn định. Khuyến khích em tự tin phát biểu xây dựng bài hơn.`;
      xepLoaiGoiY = criteria === 'tt22' ? 'Khá' : 'Hoàn thành';
    } else if (pts >= 0) {
      phamChat = `${gender} ngoan ngoãn, tôn trọng thầy cô và bạn bè, thực hiện cơ bản nội quy nề nếp.`;
      nangLuc = 'Có cố gắng trong học tập, hoàn thành các nhiệm vụ được giao ở mức đạt yêu cầu.';
      nhanXetChung = `${gender} cần chú ý tập trung hơn trong giờ học và chủ động ôn luyện bài tập về nhà.`;
      xepLoaiGoiY = criteria === 'tt22' ? 'Đạt' : 'Hoàn thành';
    } else {
      phamChat = `${gender} còn một số vi phạm nề nếp cần uốn nắn; cần nâng cao tinh thần tự giác và tôn trọng quy định chung.`;
      nangLuc = 'Khả năng tập trung chưa cao, cần sự kèm cặp và nhắc nhở thường xuyên của thầy cô và gia đình.';
      nhanXetChung = `Thầy/Cô mong ${gender} nhận thức rõ để nỗ lực khắc phục khuyết điểm, rèn luyện nghiêm túc hơn trong thời gian tới.`;
      xepLoaiGoiY = criteria === 'tt22' ? 'Chưa đạt' : 'Cần cố gắng';
    }

    return {
      id: s.id,
      name: s.name,
      phamChat,
      nangLuc,
      nhanXetChung,
      xepLoaiGoiY
    };
  });

  return { success: true, model: 'pedagogical-template-engine', comments };
}

// 2. GENERATE ZALO / SMS MESSAGE FOR PARENTS
export async function generateZaloMessage({ student, type = 'general', customNote = '', className = 'Lớp', teacherName = 'GVCN', apiKey }) {
  const activeKey = getActiveApiKey(apiKey);
  const sName = student.name || 'Học sinh';
  const pts = student.points || 0;

  if (activeKey) {
    try {
      const prompt = `Viết một tin nhắn ngắn gọn, lịch sự, ân cần từ Giáo viên chủ nhiệm (${teacherName}, lớp ${className}) gửi qua Zalo cho Phụ huynh của em ${sName}.
Chủ đề tin nhắn: ${type} (khen thưởng/nhắc nhở/vắng học/thông báo chung).
Điểm thi đua hiện tại: ${pts} điểm.
Ghi chú bổ sung: ${customNote || 'Không có'}.

Yêu cầu:
- Xưng hô kính gửi: "Kính gửi Quý Phụ huynh em ${sName}," hoặc "Thầy/Cô ${teacherName} xin thông báo đến Phụ huynh..."
- Giọng văn trang trọng, chân thành, mang tính hợp tác đồng hành giáo dục giữa gia đình và nhà trường.
- Có lời cảm ơn và số điện thoại liên hệ ở cuối.`;

      const res = await callGeminiWithCascade(prompt, 'Bạn là Trợ lý soạn thảo tin nhắn sư phạm chuẩn mực cho giáo viên chủ nhiệm Việt Nam.', activeKey);
      return { success: true, model: res.model, message: res.text.trim() };
    } catch (err) {
      console.warn('[GVCN AI] Gemini Zalo generation error:', err.message);
    }
  }

  // Fallback template
  let body = '';
  switch (type) {
    case 'commend':
      body = `Thầy/Cô rất vui mừng thông báo trong tuần qua, em ${sName} đã có sự tiến bộ vượt bậc, đạt điểm thi đua ${pts} điểm và luôn gương mẫu trong lớp. Gia đình cùng Thầy/Cô tiếp tục động viên để em phát huy nhé ạ!`;
      break;
    case 'attendance':
      body = `Thầy/Cô xin thông báo hôm nay em ${sName} có vắng/muộn học. Kính nhờ Quý Phụ huynh xác nhận lý do và phối hợp để đảm bảo an toàn, chuyên cần cho con.`;
      break;
    case 'remind':
      body = `Trong tuần qua, em ${sName} còn một số điểm cần chú ý về nề nếp học tập trên lớp (${customNote || 'cần chuẩn bị bài kỹ hơn'}). Rất mong Quý Phụ huynh nhắc nhở con nhẹ nhàng ở nhà để con tiến bộ hơn.`;
      break;
    default:
      body = `Thầy/Cô xin gửi thông báo tình hình rèn luyện của em ${sName}: Hiện em đạt ${pts} điểm thi đua. ${customNote ? 'Lưu ý: ' + customNote : 'Chúc gia đình tuần mới nhiều niềm vui!'}`;
  }

  const message = `Kính gửi Quý Phụ huynh em ${sName} (Lớp ${className}),\n\n${body}\n\nTrân trọng cảm ơn sự phối hợp của Quý Phụ huynh!\n— GVCN: ${teacherName} —`;
  return { success: true, model: 'pedagogical-template-engine', message };
}

// 3. GENERATE HOMEROOM CLASS MEETING PLAN (TIẾT SINH HOẠT LỚP 45 PHÚT)
export async function generateMeetingPlan({ week = 1, theme = 'An toàn giao thông và Nề nếp học đường', className = 'Lớp', teacherName = 'GVCN', classStats = {}, apiKey }) {
  const activeKey = getActiveApiKey(apiKey);

  if (activeKey) {
    try {
      const prompt = `Soạn Kế hoạch & Kịch bản tổ chức Tiết Sinh hoạt Lớp (45 phút) cho lớp ${className}, Tuần ${week}.
Chủ điểm sinh hoạt: ${theme}.
Giáo viên chủ nhiệm: ${teacherName}.
Dữ liệu lớp học tuần qua:
- Sĩ số: ${classStats.totalStudents || 40} học sinh.
- Điểm danh: Vắng ${classStats.absentCount || 0} lượt.
- Tổ dẫn đầu: ${classStats.topGroup || 'Tổ 1'}.
- Vấn đề nề nếp cần uốn nắn: ${classStats.issues || 'Ý thức xếp hàng và chuẩn bị bài'}.

Hãy xây dựng kịch bản chi tiết chuẩn 4 phần sư phạm:
1. Phần 1 (10 phút): Ban cán sự báo cáo tuần qua (Lớp trưởng, Lớp phó, 4 Tổ trưởng).
2. Phần 2 (10 phút): Đánh giá của GVCN, Tuyên dương cá nhân/tổ xuất sắc và Kỷ luật tích cực.
3. Phần 3 (15 phút): Sinh hoạt theo chủ điểm "${theme}" (trò chơi, thảo luận nhóm, câu hỏi tương tác).
4. Phần 4 (10 phút): Phổ biến phương hướng, nhiệm vụ tuần tới và giao việc cho Ban cán sự.`;

      const res = await callGeminiWithCascade(prompt, 'Bạn là Chuyên gia thiết kế hoạt động trải nghiệm và sinh hoạt lớp học.', activeKey);
      return { success: true, model: res.model, plan: res.text.trim() };
    } catch (err) {
      console.warn('[GVCN AI] Gemini meeting plan error:', err.message);
    }
  }

  // Fallback plan
  const plan = `KẾ HOẠCH & KỊCH BẢN TIẾT SINH HOẠT LỚP — TUẦN ${week}
LỚP: ${className} | GVCN: ${teacherName}
CHỦ ĐIỂM: ${theme.toUpperCase()}
Thời lượng: 45 phút

I. MỤC TIÊU TIẾT SINH HOẠT
1. Đánh giá toàn diện nề nếp, học tập và các phong trào thi đua trong tuần ${week}.
2. Biểu dương các cá nhân, tổ tích cực; nhắc nhở học sinh còn khuyết điểm theo hướng giáo dục tích cực.
3. Giáo dục kỹ năng sống và nhận thức theo chủ điểm "${theme}".
4. Đề ra kế hoạch hành động cụ thể cho tuần tiếp theo.

II. TIẾN TRÌNH CHI TIẾT (45 PHÚT)
1. Khởi động & Báo cáo Ban cán sự (10 phút):
   - Lớp phó văn thể bắt nhịp bài hát tập thể tạo không khí vui tươi.
   - Các Tổ trưởng báo cáo ngắn gọn điểm thi đua và tình hình tổ.
   - Lớp trưởng tổng kết nề nếp chung và sĩ số tuần qua.

2. Ý kiến nhận xét của GVCN & Vinh danh (10 phút):
   - GVCN nhận xét biểu dương Tổ dẫn đầu (${classStats.topGroup || 'Tổ 1'}) và Top học sinh tiêu biểu.
   - Nhắc nhở các lỗi nề nếp thường gặp trên tinh thần hỗ trợ, lắng nghe học sinh chia sẻ khó khăn.

3. Sinh hoạt chuyên đề "${theme}" (15 phút):
   - Hoạt động nhóm: Thảo luận về các tình huống thực tế liên quan đến chủ điểm.
   - Đại diện nhóm trình bày ý kiến; GVCN tổng kết bài học kinh nghiệm.

4. Phương hướng tuần mới & Kết thúc (10 phút):
   - Phổ biến lịch học, trực nhật, phong trào của nhà trường tuần tới.
   - Lớp trưởng phân công nhiệm vụ cụ thể cho từng thành viên.`;

  return { success: true, model: 'pedagogical-template-engine', plan };
}

// 4. EARLY WARNING SYSTEM FOR STUDENTS NEEDING CARE
export async function generateEarlyWarning({ students = [], apiKey }) {
  const activeKey = getActiveApiKey(apiKey);
  const flagged = [];

  students.forEach(s => {
    const pts = Number(s.points || 0);
    const unexcused = Number(s.unexcusedAbsences || 0);
    const flags = [];
    if (pts < 0) flags.push(`Điểm thi đua âm (${pts} điểm)`);
    if (unexcused >= 2) flags.push(`Nghỉ không phép ${unexcused} buổi`);
    if (s.recentNegativeHistory && s.recentNegativeHistory >= 3) flags.push('Bị trừ điểm 3 lần liên tiếp');

    if (flags.length > 0) {
      flagged.push({
        id: s.id,
        name: s.name,
        group: s.group || 'Chưa xếp tổ',
        flags,
        currentPoints: pts
      });
    }
  });

  if (activeKey && flagged.length > 0) {
    try {
      const prompt = `Phân tích và đưa ra giải pháp giáo dục tích cực cho danh sách học sinh cần quan tâm sau:
${JSON.stringify(flagged, null, 2)}

Hãy đưa ra:
1. Đánh giá nguyên nhân cốt lõi có thể xảy ra (tâm lý, gia đình, hòa nhập).
2. Biện pháp sư phạm gợi ý cho Giáo viên chủ nhiệm (cách tiếp cận nhẹ nhàng, không bêu tên trước lớp).
3. Đề xuất nội dung trao đổi với cha mẹ học sinh để cùng đồng hành.`;

      const res = await callGeminiWithCascade(prompt, 'Bạn là Cố vấn Tâm lý Học đường và Kỷ luật Tích cực.', activeKey);
      return { success: true, model: res.model, flagged, advice: res.text.trim() };
    } catch (err) {
      console.warn('[GVCN AI] Early warning Gemini analysis error:', err.message);
    }
  }

  const advice = flagged.length === 0
    ? 'Tuyệt vời! Lớp học hiện không có học sinh nào nằm trong diện cảnh báo nề nếp hoặc chuyên cần.'
    : `Phát hiện ${flagged.length} học sinh cần quan tâm đặc biệt. Thầy/Cô nên gặp riêng các em sau giờ học để lắng nghe nguyên nhân, kết nối với Phụ huynh để phối hợp nhắc nhở và tạo cơ hội cho các em nhận nhiệm vụ nhỏ trong lớp để gỡ điểm thi đua.`;

  return { success: true, model: 'pedagogical-template-engine', flagged, advice };
}
