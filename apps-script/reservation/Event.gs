// 回ごとに変える値．毎回ここだけ書き換える
// 部の名前はフォームの選択肢とシートにそのまま出るので，公開後は変えない
const EVENT = {
    title: '第6回気仙沼星空観望会',
    dateText: '（未定）',
    venue: '（未定）',
    address: '（未定）',
    notes: [
        'ワークショップ/プラネタリウムの集合/上映時間以降のご参加はお断りしております。',
        '変更・キャンセルは本メールに返信する形でご連絡ください。'
    ],
    senderName: '気仙沼星空観望会実行委員会',
    contact: 'kanbokaidaisakusen@gmail.com',
    workshopParts: [
        { name: '第1部 (13:30集合)', capacity: 5 },
        { name: '第2部 (14:00集合)', capacity: 5 },
        { name: '第3部 (14:30集合)', capacity: 5 },
        { name: '第4部 (15:00集合)', capacity: 5 },
        { name: '第5部 (15:30集合)', capacity: 5 },
        { name: '第6部 (16:00集合)', capacity: 5 },
        { name: '第7部 (16:30集合)', capacity: 5 },
        { name: '第8部 (17:00集合)', capacity: 5 },
        { name: '第9部 (17:30集合)', capacity: 5 },
        { name: '第10部 (18:00集合)', capacity: 5 },
        { name: '第11部 (18:30集合)', capacity: 5 },
        { name: '第12部 (19:00集合)', capacity: 5 }
    ],
    planetariumParts: [
        { name: '第1部 (13:30上映開始)', capacity: 20 },
        { name: '第2部 (14:30上映開始)', capacity: 20 },
        { name: '第3部 (15:30上映開始)', capacity: 20 }
    ]
};
