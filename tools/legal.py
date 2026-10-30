# يبني الصفحات القانونية (الشروط، الاستخدام المقبول، الاسترداد، الخصوصية) وقواميسها الإنجليزية من مصدر واحد
#   python3 tools/legal.py   → terms.html usage.html refund.html privacy.html + js/i18n/<page>.json
import json, os, html

ROOT = os.path.join(os.path.dirname(__file__), '..')
UPDATED = ('آخر تحديث: أكتوبر 2026', 'Last updated: October 2026')
EMAIL, WA, WA_TEXT = 'dmenu950@gmail.com', '966561161448', '056 116 1448'

PAGES = {}

def page(slug, title, intro, sections):
    PAGES[slug] = (title, intro, sections)

# ─── الشروط والأحكام ───
page('terms', ('الشروط والأحكام', 'Terms and conditions'),
  ('تنظم هذه الشروط استخدامك لمنصة DEV MENU وخدماتها: المنيو الرقمي، والبيجر، وبطاقة النداء، وقائمة الانتظار، وبطاقة الولاء، ورسائل العملاء، وشاشة الزبون. بتسجيلك في المنصة أو استخدامك لها فإنك توافق على هذه الشروط، وعلى سياسة الخصوصية وسياسة الاستخدام المقبول وسياسة الإلغاء والاسترداد.',
   'These terms govern your use of the DEV MENU platform and its services: the digital menu, the pager, the pager card, the waitlist, the loyalty card, customer messages and the customer screen. By signing up for or using the platform you agree to these terms and to the privacy policy, the acceptable use policy and the cancellation and refund policy.'),
  [
    (('التعريفات', 'Definitions'), [
      ('ul', [
        ('المنصة: موقع DEV MENU ولوحة التحكم وكل الصفحات والخدمات التابعة لها.', 'Platform: the DEV MENU website, dashboard and all related pages and services.'),
        ('صاحب المنشأة: الشخص أو الجهة التي تسجّل حساباً لمنشأتها وتستخدم المنصة لخدمة عملائها.', 'Business owner: the person or entity that registers an account for their business and uses the platform to serve their customers.'),
        ('العميل: زائر المنيو أو مستخدم البيجر أو قائمة الانتظار أو بطاقة الولاء لدى منشأة مشتركة.', 'Customer: anyone who views the menu or uses the pager, waitlist or loyalty card of a subscribed business.'),
        ('الحساب: حساب المنشأة الرئيسي وكل الفروع المرتبطة به.', 'Account: the main business account and all branches linked to it.'),
      ]),
    ]),
    (('الحساب والتسجيل', 'Account and registration'), [
      ('ul', [
        ('يجب أن تكون بيانات التسجيل صحيحة ومحدّثة، وأن يكون لديك الحق في تمثيل المنشأة.', 'Your registration details must be accurate and up to date, and you must be authorised to act for the business.'),
        ('تسجيل الدخول يكون برمز تحقق يُرسل إلى بريدك، وأنت مسؤول عن حماية بريدك وأجهزتك وروابط الكاشير التي تشاركها مع موظفيك.', 'Sign-in uses a code sent to your email. You are responsible for protecting your email, your devices and any cashier links you share with your staff.'),
        ('تُدار الفروع من حساب المنشأة الرئيسي، ويتجدد اشتراكها مع اشتراك الحساب بنفس النوع (شهري أو سنوي) ونفس التاريخ.', 'Branches are managed from the main business account and renew with it, on the same plan type (monthly or yearly) and the same date.'),
      ]),
    ]),
    (('التجربة المجانية', 'Free trial'), [
      ('p', 'تحصل كل منشأة جديدة على تجربة مجانية مدتها 7 أيام بالخدمات التي اختارتها، دون الحاجة إلى بيانات دفع. عند انتهاء التجربة تتوقف الخدمات عن العملاء إلى أن تشترك، وتبقى بياناتك محفوظة وفق سياسة الخصوصية.',
            'Every new business gets a 7-day free trial of the services it chose, with no payment details needed. When the trial ends the services stop for customers until you subscribe, and your data is kept as described in the privacy policy.'),
    ]),
    (('الاشتراك والأسعار والدفع', 'Subscription, prices and payment'), [
      ('ul', [
        ('تختار الخدمات التي تحتاجها، ويكون السعر مجموع أسعارها بعد خصومات الباقات المعلنة في صفحة الأسعار ولوحة التحكم، شهرياً أو سنوياً.', 'You choose the services you need. The price is the sum of their prices after the bundle discounts shown on the pricing page and in the dashboard, billed monthly or yearly.'),
        ('الولاء ورسائل العملاء تشمل الحساب كله بكل فروعه. أما الفرع الإضافي فيُحتسب له رسم ربط الفرع مع سعر الخدمات التي تُختار له.', 'The loyalty card and customer messages cover the whole account and all its branches. Each extra branch is charged a branch link fee plus the price of the services chosen for it.'),
        ('الفرع أو الخدمة التي تُضاف أثناء مدة الاشتراك يُدفع عنها مبلغ يتناسب مع الأيام المتبقية حتى تاريخ تجديد الحساب، ثم تتجدد مع الحساب.', 'A branch or service added during a subscription period is charged in proportion to the days left until the account renews, and then renews with the account.'),
        ('لا يتجدد الاشتراك بخصم تلقائي من بطاقتك. نرسل لك تذكيراً قبل انتهاء الاشتراك، ويتجدد بعد الدفع.', 'Your subscription does not renew by automatic card charge. We remind you before it ends, and it renews once payment is made.'),
        ('بعد انتهاء الاشتراك تستمر الخدمات 3 أيام مهلة للتجديد، ثم تتوقف عن العملاء حتى يتم التجديد.', 'After a subscription ends, the services keep running for a 3-day renewal grace period and then stop for customers until you renew.'),
        ('الأسعار بالريال السعودي. يحق لنا تعديل الأسعار، ولا يسري التعديل على مدة مدفوعة، ونبلغك به قبل تجديدك القادم.', 'Prices are in Saudi riyals. We may change prices, but a change never applies to a period you have already paid for, and we will tell you before your next renewal.'),
      ]),
    ]),
    (('محتواك ومسؤوليتك عنه', 'Your content and your responsibility for it'), [
      ('ul', [
        ('تبقى ملكية محتوى منشأتك لك: الأطباق والأسعار والصور والشعار والنصوص. وتمنحنا حق عرضه ومعالجته بالقدر اللازم لتقديم الخدمة.', 'You keep ownership of your business content: dishes, prices, photos, logo and text. You allow us to display and process it as needed to provide the service.'),
        ('أنت المسؤول عن صحة الأسعار والسعرات الحرارية ومكونات الأطباق ومسببات الحساسية، وعن التزامك بأنظمة هيئة الغذاء والدواء والبلدية والجهات المختصة.', 'You are responsible for the accuracy of prices, calories, ingredients and allergens, and for complying with the rules of the Saudi Food and Drug Authority, the municipality and other authorities.'),
        ('أنت المسؤول عن الوفاء بمكافآت بطاقة الولاء وعروضك التي تعلنها لعملائك، ونحن لسنا طرفاً في العلاقة بينك وبين عملائك.', 'You are responsible for honouring the loyalty rewards and offers you announce to your customers. We are not a party to the relationship between you and your customers.'),
        ('يجب ألا يخالف محتواك أو استخدامك سياسة الاستخدام المقبول.', 'Your content and use must not breach the acceptable use policy.'),
      ]),
    ]),
    (('بيانات عملائك', "Your customers' data"), [
      ('p', 'عندما يسجل عملاؤك في بطاقة الولاء أو قائمة الانتظار، فإن بياناتهم تخص منشأتك، وتكون أنت المسؤول عن استخدامها، ونحن نعالجها نيابة عنك لتقديم الخدمة فقط. تلتزم باستخدامها لخدمة عملائك والتواصل معهم بشأن منشأتك، وبعدم بيعها أو مشاركتها، وبالاستجابة لطلباتهم بالاطلاع أو الحذف، وفقاً لنظام حماية البيانات الشخصية.',
            "When your customers join your loyalty card or waitlist, their data belongs to your business and you are responsible for how it is used. We process it on your behalf only to provide the service. You agree to use it only to serve your customers and contact them about your business, not to sell or share it, and to respond to their access and deletion requests, in line with the Personal Data Protection Law."),
    ]),
    (('طبيعة الخدمات', 'How the services work'), [
      ('ul', [
        ('البيجر وبطاقة النداء والإشعارات تعتمد على جوال العميل واتصاله بالإنترنت وإعداداته وخدمات Apple وGoogle، لذلك لا نضمن وصول كل إشعار. ننصحك بأن تكون لديك وسيلة بديلة لمناداة العميل.', "The pager, pager card and notifications depend on the customer's phone, internet connection and settings, and on Apple and Google services, so we cannot guarantee every notification arrives. We recommend keeping another way to call customers."),
        ('بطاقات المحفظة تعمل عبر Apple Wallet وGoogle Wallet وتخضع لشروطهما.', 'Wallet cards work through Apple Wallet and Google Wallet and are subject to their terms.'),
        ('الرسائل والردود التي يكتبها المساعد الذكي تُولَّد آلياً وقد تحتوي على أخطاء، وأنت المسؤول عن مراجعة ما يُرسل باسم منشأتك.', 'Messages and replies written by the AI assistant are generated automatically and may contain mistakes. You are responsible for reviewing what is sent in your business name.'),
        ('نعمل على أن تكون المنصة متاحة دائماً، لكن قد تحدث انقطاعات للصيانة أو لأسباب خارجة عن إرادتنا.', 'We work to keep the platform available at all times, but there may be interruptions for maintenance or for reasons beyond our control.'),
      ]),
    ]),
    (('الملكية الفكرية', 'Intellectual property'), [
      ('p', 'المنصة وتصميمها وبرمجياتها وعلامتها التجارية ملك لـ DEV MENU. لا يجوز نسخها أو إعادة بيعها أو محاولة استخراج شفرتها أو استخدامها لبناء خدمة منافسة.',
            'The platform, its design, software and brand belong to DEV MENU. You may not copy or resell them, try to extract their code, or use them to build a competing service.'),
    ]),
    (('إيقاف الحساب وإنهاؤه', 'Suspension and termination'), [
      ('ul', [
        ('يحق لنا إيقاف الحساب أو جزء من خدماته عند عدم السداد، أو مخالفة هذه الشروط أو سياسة الاستخدام المقبول، أو إذا طلبت ذلك جهة رسمية. ونبلغك بالسبب ما لم يمنعنا نظام من ذلك.', 'We may suspend an account, or some of its services, for non-payment, for a breach of these terms or the acceptable use policy, or at the request of an official authority. We will tell you why unless the law prevents it.'),
        ('يمكنك إنهاء اشتراكك متى شئت كما هو موضح في سياسة الإلغاء والاسترداد، وطلب حذف حسابك وبياناته.', 'You can end your subscription at any time as described in the cancellation and refund policy, and ask for your account and its data to be deleted.'),
      ]),
    ]),
    (('حدود المسؤولية', 'Limitation of liability'), [
      ('p', 'تُقدَّم المنصة كما هي. لا نتحمل المسؤولية عن الخسائر غير المباشرة، مثل فوات الربح أو الطلبات، ولا عن الأخطاء في المحتوى الذي تضيفه أنت. وفي جميع الأحوال لا تتجاوز مسؤوليتنا ما دفعته لنا خلال الأشهر الثلاثة السابقة للمطالبة.',
            'The platform is provided as it is. We are not liable for indirect losses, such as lost profit or orders, or for errors in content you add. In any case our liability is limited to what you paid us in the three months before the claim.'),
    ]),
    (('تعديل الشروط', 'Changes to these terms'), [
      ('p', 'قد نعدّل هذه الشروط، ونبلغك بالتعديلات الجوهرية عبر لوحة التحكم أو البريد قبل سريانها. واستمرارك في استخدام المنصة بعد سريانها يعني موافقتك عليها.',
            'We may change these terms. We will tell you about significant changes in the dashboard or by email before they take effect, and continuing to use the platform after that means you accept them.'),
    ]),
    (('النظام المطبق', 'Governing law'), [
      ('p', 'تخضع هذه الشروط لأنظمة المملكة العربية السعودية، وتختص المحاكم المختصة في المملكة بالنظر في أي نزاع لا يُحل ودياً.',
            'These terms are governed by the laws of the Kingdom of Saudi Arabia, and any dispute not settled amicably falls under the competent courts of the Kingdom.'),
    ]),
  ])

# ─── سياسة الاستخدام المقبول ───
page('usage', ('سياسة الاستخدام المقبول', 'Acceptable use policy'),
  ('توضح هذه السياسة ما لا يجوز فعله عند استخدام منصة DEV MENU، حمايةً لعملائك وللمنشآت الأخرى وللمنصة. وهي جزء من الشروط والأحكام.',
   'This policy sets out what you may not do when using DEV MENU, to protect your customers, other businesses and the platform. It is part of the terms and conditions.'),
  [
    (('المحتوى الممنوع', 'Prohibited content'), [
      ('ul', [
        ('منتجات أو خدمات يمنع بيعها أو الإعلان عنها في المملكة العربية السعودية.', 'Products or services that may not be sold or advertised in Saudi Arabia.'),
        ('أسعار أو عروض أو مكافآت مضللة، أو معلومات غذائية غير صحيحة.', 'Misleading prices, offers or rewards, or incorrect nutritional information.'),
        ('محتوى مسيء أو مخالف للآداب العامة، أو يمس الدين أو الدولة أو أي شخص.', 'Offensive or indecent content, or content that insults religion, the state or any person.'),
        ('صور أو علامات تجارية أو نصوص لا تملك حق استخدامها.', 'Images, trademarks or text you do not have the right to use.'),
        ('انتحال اسم منشأة أخرى أو هويتها.', "Impersonating another business's name or identity."),
      ]),
    ]),
    (('التواصل مع العملاء', 'Contacting customers'), [
      ('ul', [
        ('تُستخدم رسائل العملاء وبطاقة الولاء والبيجر للتواصل مع عملاء منشأتك بشأن منشأتك فقط.', 'Customer messages, the loyalty card and the pager may be used only to contact your own customers about your business.'),
        ('لا يجوز إرسال رسائل مزعجة أو متكررة بشكل مبالغ فيه، أو رسائل لا علاقة لها بمنشأتك، أو روابط ضارة.', 'You may not send spam, excessive repeated messages, messages unrelated to your business, or harmful links.'),
        ('لا يجوز تسجيل عملاء في بطاقة الولاء أو قائمة الانتظار دون علمهم، أو استيراد أرقام لم يوافق أصحابها على التواصل.', 'You may not sign customers up for the loyalty card or waitlist without their knowledge, or import numbers whose owners did not agree to be contacted.'),
      ]),
    ]),
    (('الاستخدام العادل للمنصة', 'Fair use of the platform'), [
      ('ul', [
        ('لا يجوز التحايل على الأختام أو المكافآت أو منح أختام وهمية.', 'You may not manipulate stamps or rewards, or give fake stamps.'),
        ('لا يجوز محاولة الوصول إلى حسابات أو بيانات منشآت أخرى، أو اختبار ثغرات المنصة دون إذن مكتوب منا.', "You may not try to access other businesses' accounts or data, or test the platform for vulnerabilities without our written permission."),
        ('لا يجوز تحميل المنصة ما يفوق الاستخدام المعتاد بطرق آلية، أو نسخ محتواها، أو إعادة بيع الخدمة.', 'You may not overload the platform with automated use beyond normal use, scrape its content, or resell the service.'),
        ('لا يجوز مشاركة روابط الكاشير أو الحساب مع أشخاص خارج منشأتك.', 'You may not share cashier links or your account with people outside your business.'),
      ]),
    ]),
    (('عند المخالفة', 'If this policy is breached'), [
      ('p', 'يحق لنا حذف المحتوى المخالف، أو إيقاف الخدمة المعنية، أو إيقاف الحساب، بحسب جسامة المخالفة، ودون استرداد للمدة المتبقية إذا كانت المخالفة جسيمة أو متكررة. ولإبلاغنا عن محتوى مخالف لدى أي منشأة، تواصل معنا.',
            'We may remove the content, suspend the service concerned or suspend the account, depending on how serious the breach is, with no refund for the remaining period if the breach is serious or repeated. To report content that breaks this policy on any business page, contact us.'),
    ]),
  ])

# ─── الإلغاء والاسترداد ───
page('refund', ('سياسة الإلغاء والاسترداد', 'Cancellation and refund policy'),
  ('توضح هذه السياسة كيف تلغي اشتراكك في DEV MENU ومتى يحق لك استرداد ما دفعته. وهي جزء من الشروط والأحكام.',
   'This policy explains how to cancel your DEV MENU subscription and when you can get a refund. It is part of the terms and conditions.'),
  [
    (('التجربة المجانية', 'Free trial'), [
      ('p', 'التجربة المجانية لمدة 7 أيام لا تتطلب أي دفع، فلا يوجد ما يُسترد عنها، ويمكنك التوقف عن الاستخدام متى شئت.',
            'The 7-day free trial needs no payment, so there is nothing to refund, and you can stop using it at any time.'),
    ]),
    (('إلغاء الاشتراك', 'Cancelling your subscription'), [
      ('ul', [
        ('يمكنك الإلغاء في أي وقت عبر "راسل الإدارة" في لوحة التحكم أو بالتواصل معنا.', 'You can cancel at any time through "Contact admin" in the dashboard or by contacting us.'),
        ('لا يتجدد الاشتراك بخصم تلقائي، فإذا لم تجدد لن يُطلب منك أي مبلغ إضافي.', 'Subscriptions do not renew by automatic charge, so if you do not renew you will not be asked to pay anything more.'),
        ('تستمر خدماتك حتى نهاية المدة المدفوعة ثم تتوقف عن العملاء.', 'Your services keep running until the end of the paid period and then stop for customers.'),
      ]),
    ]),
    (('الاسترداد', 'Refunds'), [
      ('ul', [
        ('أول اشتراك مدفوع: يحق لك استرداد المبلغ كاملاً إذا طلبت ذلك خلال 7 أيام من الدفع.', 'First paid subscription: you can get a full refund if you ask within 7 days of paying.'),
        ('التجديد والفروع والخدمات المضافة أثناء الاشتراك: لا تُسترد بعد تفعيلها، إلا إذا طلبت ذلك خلال 48 ساعة من الدفع ولم تُستخدم.', 'Renewals, branches and services added during a subscription are not refundable once activated, unless you ask within 48 hours of paying and they have not been used.'),
        ('إذا انقطعت الخدمة بسبب من جهتنا لأكثر من 72 ساعة متصلة، نمدد اشتراكك بعدد أيام الانقطاع، أو نسترد لك قيمتها إذا طلبت ذلك.', 'If the service is down for more than 72 hours in a row because of a problem on our side, we extend your subscription by the number of days lost, or refund their value if you prefer.'),
        ('لا يُسترد أي مبلغ عن حساب أُوقف بسبب مخالفة جسيمة للشروط أو لسياسة الاستخدام المقبول.', 'No refund is given for an account suspended for a serious breach of the terms or the acceptable use policy.'),
      ]),
    ]),
    (('طريقة الاسترداد ومدته', 'How refunds are paid'), [
      ('p', 'تواصل معنا بالبريد أو الواتساب واذكر اسم منشأتك ورقم الفاتورة. نرد على طلبك خلال 3 أيام عمل، ويُعاد المبلغ بنفس وسيلة الدفع خلال 14 يوماً من الموافقة.',
            'Contact us by email or WhatsApp with your business name and invoice number. We reply within 3 working days, and the money is returned to the same payment method within 14 days of approval.'),
    ]),
    (('بعد الإلغاء', 'After cancelling'), [
      ('p', 'نحتفظ ببيانات منشأتك 90 يوماً بعد انتهاء الاشتراك حتى تتمكن من العودة دون إعادة الإعداد، ثم يجوز لنا حذفها. ويمكنك طلب حذفها فوراً في أي وقت.',
            "We keep your business data for 90 days after your subscription ends so you can come back without setting everything up again, and after that we may delete it. You can ask us to delete it straight away at any time."),
    ]),
  ])

# ─── سياسة الخصوصية ───
page('privacy', ('سياسة الخصوصية', 'Privacy policy'),
  ('توضح هذه السياسة كيف تجمع منصة DEV MENU البيانات وتستخدمها وتحميها، وفقاً لنظام حماية البيانات الشخصية في المملكة العربية السعودية.',
   "This policy explains how DEV MENU collects, uses and protects data, in line with Saudi Arabia's Personal Data Protection Law."),
  [
    (('البيانات التي نجمعها من أصحاب المنشآت', 'Data we collect from business owners'), [
      ('ul', [
        ('اسم المنشأة ونوع نشاطها وفروعها.', 'The business name, type of business and branches.'),
        ('البريد الإلكتروني، ويُستخدم لتسجيل الدخول برمز التحقق ولإرسال الفواتير والتنبيهات.', 'Email address, used to sign in with a verification code and to send invoices and alerts.'),
        ('رقم الجوال، ويُستخدم للتواصل بخصوص الاشتراك والدعم.', 'Mobile number, used to contact you about your subscription and support.'),
        ('محتوى المنيو الذي تضيفه: الأطباق والأسعار والصور والشعار وروابط التواصل ومعلومات المنشأة.', 'The menu content you add: dishes, prices, photos, logo, social links and business information.'),
      ]),
    ]),
    (('بيانات زوار المنيو', 'Data about menu visitors'), [
      ('p', 'لا نطلب من زوار المنيو تسجيل الدخول، ولا نجمع أسماءهم أو أرقامهم. نسجّل فقط عدد مرات فتح المنيو وعدد مشاهدات كل طبق، بشكل مجهول لا يرتبط بأي شخص، لعرض الإحصائيات لصاحب المنشأة. وعند اختيار "اطلب عبر واتساب" تنتقل المحادثة مباشرة إلى واتساب بين الزائر والمنشأة، ولا تمر عبر منصتنا.',
            'Menu visitors do not sign in, and we do not collect their names or numbers. We only count menu views and dish views anonymously, without linking them to anyone, to show statistics to the business owner. When a visitor chooses "Order via WhatsApp", the chat goes straight to WhatsApp between the visitor and the business and does not pass through our platform.'),
    ]),
    (('بيانات عملاء البيجر', 'Pager customer data'), [
      ('p', 'عند أخذ رقم من البيجر نحفظ رقم الطلب وحالته، واشتراك الإشعارات في متصفح الجوال أو بطاقة النداء في المحفظة، حتى يصل للعميل تنبيه عند جاهزية طلبه. لا نطلب اسمه أو رقمه لذلك. وإذا حفظ بطاقة النداء قد تصله رسائل من المنشأة، ويمكنه إزالتها من محفظته في أي وقت.',
            "When a customer takes a pager number, we store the order number and its status, plus the notification subscription in their phone browser or the pager card in their wallet, so they are alerted when their order is ready. We do not ask for their name or number for this. If they keep the pager card, the business may send them messages, and they can remove the card from their wallet at any time."),
    ]),
    (('بيانات أعضاء بطاقة الولاء', 'Loyalty card member data'), [
      ('ul', [
        ('الاسم ورقم الجوال والجنس، وعدد الأختام والزيارات والمكافآت وتواريخها، والفرع الذي تمت فيه.', 'Name, mobile number and gender, plus stamps, visits and rewards with their dates, and the branch where they happened.'),
        ('عند الختم بالموقع نستخدم موقع الجوال لحظياً للتأكد من وجود العميل في المنشأة، ولا نحفظ الموقع نفسه، بل المسافة التقريبية فقط.', 'When stamping by location we use the phone location only at that moment to confirm the customer is at the business. We do not store the location itself, only the approximate distance.'),
        ('الردود على سؤال "وش أخّرك عنا؟" إن أجاب عنها العميل.', 'Answers to the "What kept you away?" question, if the customer answers it.'),
      ]),
      ('p', 'هذه البيانات تخص المنشأة التي سجل فيها العميل، ويطّلع عليها صاحبها ويستخدمها لخدمة عملائه والتواصل معهم بشأن منشأته، ونحن نعالجها نيابة عنه.',
            'This data belongs to the business the customer joined. The owner can see it and uses it to serve and contact their customers about their business, and we process it on their behalf.'),
    ]),
    (('بيانات ضيوف قائمة الانتظار', 'Waitlist guest data'), [
      ('p', 'عند التسجيل في قائمة انتظار إحدى المنشآت، نحفظ البيانات التي تطلبها المنشأة (مثل الاسم ورقم الجوال والبريد الإلكتروني وعدد الأشخاص) لإدارة الدور وإرسال رسائل التأكيد وحلول الدور. هذه البيانات تخص المنشأة نفسها، ويطّلع عليها ويستطيع تنزيلها لأغراض خدمة الضيوف فقط.',
            'When someone joins a business waitlist, we store the details the business asks for (such as name, mobile number, email and party size) to manage the queue and send confirmation and turn messages. This data belongs to the business, which can view and download it only to serve its guests.'),
    ]),
    (('كيف نستخدم البيانات', 'How we use data'), [
      ('ul', [
        ('تشغيل الحساب وعرض المنيو والخدمات للعملاء.', 'Running accounts and showing the menu and services to customers.'),
        ('إرسال رموز التحقق والفواتير وتنبيهات الاشتراك.', 'Sending verification codes, invoices and subscription alerts.'),
        ('إرسال الإشعارات ورسائل المنشأة إلى عملائها بطلب منها.', 'Sending notifications and business messages to its customers at the business request.'),
        ('الدعم الفني وتحسين المنصة وحمايتها من إساءة الاستخدام.', 'Support, improving the platform and protecting it from misuse.'),
      ]),
      ('p', 'لا نبيع البيانات ولا نشاركها مع أي جهة لأغراض تسويقية.', 'We do not sell data or share it with anyone for marketing.'),
    ]),
    (('مزودو الخدمة', 'Service providers'), [
      ('p', 'نستعين بمزودي خدمات موثوقين لتشغيل المنصة، ويعالجون البيانات لهذا الغرض فقط، وقد تكون خوادمهم خارج المملكة العربية السعودية:',
            'We rely on trusted service providers to run the platform. They process data only for this purpose, and their servers may be outside Saudi Arabia:'),
      ('ul', [
        ('Supabase لقاعدة البيانات وتسجيل الدخول وتخزين الصور، وVercel لاستضافة المنصة.', 'Supabase for the database, sign-in and image storage, and Vercel for hosting.'),
        ('Apple Wallet وGoogle Wallet ومزود إصدار بطاقات المحفظة، لبطاقات الولاء والنداء.', 'Apple Wallet, Google Wallet and our wallet pass provider, for loyalty and pager cards.'),
        ('خدمة البريد الإلكتروني لإرسال الرموز والفواتير.', 'An email service to send codes and invoices.'),
        ('Anthropic لتشغيل المساعد الذكي عند تفعيله، ويُرسل إليه ما يلزم لكتابة الرسالة فقط، مثل الاسم الأول وعدد الزيارات، دون رقم الجوال.', "Anthropic to run the AI assistant when it is turned on. It receives only what is needed to write the message, such as the first name and number of visits, never the mobile number."),
      ]),
    ]),
    (('التخزين والحماية', 'Storage and security'), [
      ('p', 'تنتقل البيانات عبر اتصال مشفّر، ويقتصر الوصول إلى بيانات كل منشأة على صاحبها ومن يمنحهم رابط الكاشير وعلى إدارة المنصة لأغراض الدعم.',
            'Data travels over an encrypted connection. Access to each business data is limited to its owner, the staff they give a cashier link, and the platform team for support.'),
    ]),
    (('مدة الاحتفاظ والحذف', 'Retention and deletion'), [
      ('ul', [
        ('نحتفظ ببيانات المنشأة طالما حسابها قائم، و90 يوماً بعد انتهاء الاشتراك، ثم يجوز لنا حذفها.', 'We keep business data while the account exists and for 90 days after the subscription ends, after which we may delete it.'),
        ('يمكن لصاحب المنشأة طلب حذف حسابه وكل بياناته نهائياً في أي وقت، ويتم الحذف خلال 30 يوماً كحد أقصى.', 'A business owner can ask for their account and all its data to be permanently deleted at any time, and we delete it within 30 days at most.'),
        ('يمكن للعميل طلب حذف بطاقته أو بياناته من المنشأة نفسها أو منا.', 'A customer can ask the business, or us, to delete their card or data.'),
      ]),
    ]),
    (('حقوقك', 'Your rights'), [
      ('ul', [
        ('الاطلاع على بياناتك والحصول على نسخة منها.', 'To see your data and get a copy of it.'),
        ('تصحيح بياناتك أو تحديثها.', 'To correct or update your data.'),
        ('طلب حذف بياناتك.', 'To ask for your data to be deleted.'),
        ('سحب موافقتك على تلقي الرسائل في أي وقت.', 'To withdraw your consent to receiving messages at any time.'),
      ]),
    ]),
  ])

NAV = [('terms', 'الشروط والأحكام', 'Terms and conditions'), ('privacy', 'سياسة الخصوصية', 'Privacy policy'),
       ('usage', 'سياسة الاستخدام المقبول', 'Acceptable use policy'), ('refund', 'سياسة الإلغاء والاسترداد', 'Cancellation and refund policy')]

STYLE = """  :root { --brand: #233d2c; --sand: #f5f2eb; --gold-deep: #8a6d0f; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Cairo', Tahoma, sans-serif; background: var(--sand); color: #1b3022; line-height: 1.9; }
  header { background: var(--brand); color: var(--sand); padding: 18px 20px; }
  header .wrap { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  header a { color: var(--sand); text-decoration: none; font-weight: 800; font-size: 14px; }
  .wrap { max-width: 760px; margin: 0 auto; }
  main { padding: 36px 20px 40px; }
  h1 { font-size: 28px; font-weight: 900; margin: 0 0 4px; }
  .updated { font-size: 12px; color: rgba(35,61,44,.6); font-weight: 700; margin-bottom: 28px; }
  h2 { font-size: 17px; font-weight: 900; margin: 30px 0 8px; color: var(--brand); }
  p, li { font-size: 14px; font-weight: 600; color: rgba(27,48,34,.85); }
  ul { padding-inline-start: 20px; margin: 6px 0; }
  li { margin-bottom: 4px; }
  .card { background: #fff; border: 1.5px solid rgba(35,61,44,.14); border-radius: 22px; padding: 26px 28px; }
  a.inline { color: var(--gold-deep); font-weight: 800; }
  nav.legal { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 18px; padding: 0 20px 14px; }
  nav.legal a { font-size: 12px; font-weight: 800; color: var(--brand); text-decoration: none; }
  nav.legal a[aria-current] { color: var(--gold-deep); text-decoration: underline; text-underline-offset: 4px; }
  footer { text-align: center; font-size: 11px; color: rgba(35,61,44,.5); font-weight: 700; padding-bottom: 30px; }
  @media (max-width: 560px) { .card { padding: 22px 18px; } h1 { font-size: 24px; } }"""

def esc(s): return html.escape(s, quote=False)

def build(slug):
    (title, intro, sections) = PAGES[slug]
    d = {}
    def t(ar, en): d[ar] = en; return esc(ar)
    body = [f'    <h1>{t(*title)}</h1>', f'    <p class="updated">{t(*UPDATED)}</p>', '', f'    <p>{t(*intro)}</p>']
    for (h2, blocks) in sections:
        body += ['', f'    <h2>{t(*h2)}</h2>']
        for blk in blocks:
            if blk[0] == 'p': body.append(f'    <p>{t(blk[1], blk[2])}</p>')
            else: body += ['    <ul>'] + [f'      <li>{t(a, e)}</li>' for a, e in blk[1]] + ['    </ul>']
    body += ['', f'    <h2>{t("التواصل معنا", "Contact us")}</h2>',
             f'    <p>{t("البريد:", "Email:")} <a class="inline" href="mailto:{EMAIL}" dir="ltr">{EMAIL}</a><br>',
             f'    {t("واتساب:", "WhatsApp:")} <a class="inline" href="https://wa.me/{WA}" target="_blank" rel="noopener" dir="ltr">{WA_TEXT}</a></p>']
    nav = '\n'.join(f'  <a href="{s}.html"{" aria-current=\"page\"" if s == slug else ""}>{t(ar, en)}</a>' for s, ar, en in NAV)
    t(f'{title[0]} | DEV MENU', f'{title[1]} | DEV MENU'); t('العودة للرئيسية', 'Back to home'); t('جميع الحقوق محفوظة © DEV MENU 2026', 'All rights reserved © DEV MENU 2026')
    out = f"""<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<script src="/js/i18n.js?v=7" data-dict="{slug}"></script>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/png" sizes="192x192" href="/images/icon-192.png">
<link rel="apple-touch-icon" href="/images/apple-touch-icon.png">
<title>{esc(title[0])} | DEV MENU</title>
<link rel="canonical" href="https://www.devmenu.digital/{slug}.html">
<!-- مولّدة من tools/legal.py: عدّل النص هناك وشغّل python3 tools/legal.py -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>
{STYLE}
</style>
</head>
<body>
<header>
  <div class="wrap">
    <a href="index.html">DEV MENU</a>
    <a href="index.html" style="font-size:12px;opacity:.8">العودة للرئيسية</a>
  </div>
</header>

<main class="wrap">
  <div class="card">
{chr(10).join(body)}
  </div>
</main>

<nav class="legal">
{nav}
</nav>
<footer>جميع الحقوق محفوظة © DEV MENU 2026</footer>
</body>
</html>
"""
    open(os.path.join(ROOT, f'{slug}.html'), 'w').write(out)
    open(os.path.join(ROOT, f'js/i18n/{slug}.json'), 'w').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')
    print(slug, len(d), 'strings')

for s in PAGES: build(s)
